using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using EventAggregator.Application.Interfaces;
using EventAggregator.Domain.Models;
using Microsoft.Extensions.Logging;
using PuppeteerSharp;

namespace EventAggregator.Infrastructure.Scrapers;

public class ConcertUaScraper : IEventScraper
{
    public string ProviderName => "Concert.ua";
    private readonly ILogger<ConcertUaScraper> _logger;
    private readonly SemaphoreSlim _semaphore = new(5); 

    private readonly string[] _citySlugs =
    {
        "kyiv", "odesa", "dnipro", "lviv", "kharkiv", "ivano-frankivsk",
        "vinnytsia", "poltava", "zhytomyr", "zaporizhzhia", "ternopil",
        "chernivtsi", "chernihiv", "sumy", "khmelnytskyi", "rivne",
        "lutsk", "mykolaiv", "uzhhorod", "kropyvnytskyi"
    };

    private static readonly Dictionary<string, string> CityTranslations = new(StringComparer.OrdinalIgnoreCase)
    {
        { "kyiv", "Київ" }, { "odesa", "Одеса" }, { "dnipro", "Дніпро" }, { "lviv", "Львів" },
        { "kharkiv", "Харків" }, { "ivano-frankivsk", "Івано-Франківськ" }, { "vinnytsia", "Вінниця" },
        { "poltava", "Полтава" }, { "zhytomyr", "Житомир" }, { "zaporizhzhia", "Запоріжжя" },
        { "ternopil", "Тернопіль" }, { "chernivtsi", "Чернівці" }, { "chernihiv", "Чернігів" },
        { "sumy", "Суми" }, { "khmelnytskyi", "Хмельницький" }, { "rivne", "Рівне" },
        { "lutsk", "Луцьк" }, { "mykolaiv", "Миколаїв" }, { "uzhhorod", "Ужгород" },
        { "kropyvnytskyi", "Кропивницький" }
    };

    public ConcertUaScraper(ILogger<ConcertUaScraper> logger)
    {
        _logger = logger;
    }

    public async Task<List<ScrapedEvent>> ScrapeAsync(IBrowser browser)
    {
        var allCollectedEvents = new List<ScrapedEvent>();
        
        using var httpClient = new HttpClient();
        httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
        httpClient.DefaultRequestHeaders.Add("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8");
        httpClient.DefaultRequestHeaders.Add("Accept-Language", "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7");

        _logger.LogInformation("🚀 Початок гібридного API-скрапінгу Concert.ua...");

        var tasks = _citySlugs.Select(async citySlug =>
        {
            await _semaphore.WaitAsync();

            try
            {
                await Task.Delay(Random.Shared.Next(400, 800));

                string targetUrl = $"https://concert.ua/uk/{citySlug}";
                var response = await httpClient.GetAsync(targetUrl);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("⚠️ Не вдалося завантажити сторінку для {City}: {Code}", citySlug, response.StatusCode);
                    return;
                }

                string htmlContent = await response.Content.ReadAsStringAsync();
                int cityEventsCount = 0;

                // 🌟 КРОК 1: Спроба витягти дані через мікророзметку JSON-LD
                var jsonLdRegex = new Regex(@"<script[^>]*type=[""']application/ld\+json[""'][^>]*>([\s\S]*?)</script>", RegexOptions.IgnoreCase);
                var matches = jsonLdRegex.Matches(htmlContent);

                foreach (Match match in matches)
                {
                    try
                    {
                        string jsonRaw = match.Groups[1].Value.Trim();
                        using var doc = JsonDocument.Parse(jsonRaw);
                        var root = doc.RootElement;

                        // Обробляємо і масиви подій, і поодинокі об'єкти
                        var elementsToProcess = new List<JsonElement>();
                        if (root.ValueKind == JsonValueKind.Array) elementsToProcess.AddRange(root.EnumerateArray());
                        else if (root.ValueKind == JsonValueKind.Object) elementsToProcess.Add(root);

                        foreach (var node in elementsToProcess)
                        {
                            if (!node.TryGetProperty("@type", out var typeProp) || !(typeProp.GetString()?.Contains("Event") ?? false)) 
                                continue;

                            string title = node.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "Без назви" : "Без назви";
                            string url = node.TryGetProperty("url", out var urlProp) ? urlProp.GetString() ?? "" : "";
                            string imageUrl = node.TryGetProperty("image", out var imgProp) ? imgProp.GetString() ?? "" : "";
                            string startDateRaw = node.TryGetProperty("startDate", out var startProp) ? startProp.GetString() ?? "" : "";
                            
                            string description = node.TryGetProperty("description", out var descProp) ? descProp.GetString() ?? "" : "Деталі на сайті.";

                            if (string.IsNullOrEmpty(url)) continue;
                            if (url.StartsWith("/")) url = "https://concert.ua" + url;

                            DateTime? parsedDate = null;
                            if (!string.IsNullOrEmpty(startDateRaw) && DateTime.TryParse(startDateRaw, out var dt)) parsedDate = dt;

                            var newEvent = new ScrapedEvent
                            {
                                Title = title, Url = url, Source = ProviderName, Description = description,
                                Date = parsedDate.HasValue ? parsedDate.Value.ToString("dd.MM.yyyy HH:mm") : startDateRaw,
                                ParsedDate = parsedDate, City = citySlug.ToUpper(),
                                CityUk = CityTranslations.GetValueOrDefault(citySlug.ToLower(), citySlug),
                                Category = GuessCategory(url, title), ImageUrl = imageUrl
                            };
                            newEvent.GenerateDeterministicId();

                            lock (allCollectedEvents)
                            {
                                if (!allCollectedEvents.Any(e => e.Url == newEvent.Url))
                                {
                                    allCollectedEvents.Add(newEvent);
                                    cityEventsCount++;
                                }
                            }
                        }
                    }
                    catch { /* Ігноруємо биті JSON блоки */ }
                }

                if (cityEventsCount == 0)
                {
                    var cardRegex = new Regex(@"<a[^>]*class=""[^""]*event-card[^""]*""[^>]*href=""([^""]+)""[^>]*data-date-start=""([^""]+)""[^>]*data-item-categories=""([^""]+)""[\s\S]*?<img[^>]*src=""([^""]+)""[^>]*alt=""([^""]+)""", RegexOptions.IgnoreCase);
                    var cardMatches = cardRegex.Matches(htmlContent);

                    foreach (Match m in cardMatches)
                    {
                        string url = m.Groups[1].Value;
                        if (url.StartsWith("/")) url = "https://concert.ua" + url;
                        string dateStr = m.Groups[2].Value; // формат: 2026-09-25 18:30:00
                        string categoryStr = m.Groups[3].Value;
                        string image = m.Groups[4].Value;
                        string title = m.Groups[5].Value.Replace("&quot;", "\"");

                        DateTime? parsedDate = null;
                        if (DateTime.TryParse(dateStr, out var dt)) parsedDate = dt;

                        var fallbackEvent = new ScrapedEvent
                        {
                            Title = title, Url = url, Source = ProviderName, Description = "Деталі події дивіться на сайті.",
                            Date = parsedDate?.ToString("dd.MM.yyyy HH:mm") ?? dateStr, ParsedDate = parsedDate,
                            City = citySlug.ToUpper(), CityUk = CityTranslations.GetValueOrDefault(citySlug.ToLower(), citySlug),
                            Category = GuessCategory(url + " " + categoryStr, title), ImageUrl = image
                        };
                        fallbackEvent.GenerateDeterministicId();

                        lock (allCollectedEvents)
                        {
                            if (!allCollectedEvents.Any(e => e.Url == fallbackEvent.Url))
                            {
                                allCollectedEvents.Add(fallbackEvent);
                                cityEventsCount++;
                            }
                        }
                    }
                }

                if (cityEventsCount > 0)
                {
                    _logger.LogInformation("✅ Concert.ua: Отримано {Count} подій для міста {City}", cityEventsCount, citySlug.ToUpper());
                }
            }
            catch (Exception ex)
            {
                _logger.LogError("❌ Помилка збору міста {City}: {Message}", citySlug, ex.Message);
            }
            finally
            {
                _semaphore.Release();
            }
        });

        await Task.WhenAll(tasks);

        _logger.LogInformation("🏁 Concert.ua: Збір завершено. Фінальний звіт провайдера:");
        _logger.LogInformation("=================================================");

        var statsByCity = allCollectedEvents.GroupBy(e => e.CityUk).OrderByDescending(g => g.Count());

        _logger.LogInformation("📌 Розподіл за МІСТАМИ:");
        foreach (var group in statsByCity) _logger.LogInformation("   📍 {City}: {Count} подій", group.Key, group.Count());

        _logger.LogInformation("-------------------------------------------------");

        var statsByCategory = allCollectedEvents.GroupBy(e => e.Category).OrderByDescending(g => g.Count());

        _logger.LogInformation("📌 Розподіл за КАТЕГОРІЯМИ:");
        foreach (var group in statsByCategory) _logger.LogInformation("   🏷️ {Category}: {Count} подій", group.Key.ToUpper(), group.Count());

        _logger.LogInformation("=================================================");
        _logger.LogInformation("🏁 Concert.ua: Всього знайдено унікальних подій: {Count}", allCollectedEvents.Count);
        
        return allCollectedEvents;
    }

    private static string GuessCategory(string url, string title)
    {
        var combined = $"{url} {title}".ToLower();

        return combined switch
        {
            var c when c.Contains("theatre") || c.Contains("театр") || c.Contains("вистава") || c.Contains("opera") || c.Contains("балет") => "theatres",
            var c when c.Contains("concert") || c.Contains("концерт") || c.Contains("pop") || c.Contains("rock") || c.Contains("музика") || c.Contains("jazz") || c.Contains("оркестр") => "concerts",
            var c when c.Contains("stand-up") || c.Contains("стендап") || c.Contains("гумор") || c.Contains("комедія") => "stand-up",
            var c when c.Contains("child") || c.Contains("дітям") || c.Contains("дитяч") || c.Contains("ляльковий") => "child",
            var c when c.Contains("festival") || c.Contains("фестиваль") => "festivals",
            _ => "inshe"
        };
    }
}