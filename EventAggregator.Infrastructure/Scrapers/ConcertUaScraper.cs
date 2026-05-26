using System.Text.Json;
using System.Text.RegularExpressions;
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

        _logger.LogInformation("🚀 Початок швидкого API-скрапінгу Concert.ua через мікророзметку JSON-LD...");

        var tasks = _citySlugs.Select(async citySlug =>
        {
            await _semaphore.WaitAsync();
            _logger.LogInformation("🏙️ Concert.ua: Сканування міста {City}...", citySlug.ToUpper());

            try
            {
                string targetUrl = $"https://concert.ua/uk/{citySlug}";
                var response = await httpClient.GetAsync(targetUrl);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("⚠️ Не вдалося завантажити сторінку для міста {City}: {Code}", citySlug, response.StatusCode);
                    return;
                }

                string htmlContent = await response.Content.ReadAsStringAsync();

                var jsonLdRegex = new Regex(@"<script\s+type=""application/ld\+json"">([\s\S]*?)</script>", RegexOptions.IgnoreCase);
                var matches = jsonLdRegex.Matches(htmlContent);

                int cityEventsCount = 0;

                foreach (Match match in matches)
                {
                    try
                    {
                        string jsonRaw = match.Groups[1].Value.Trim();
                        using var doc = JsonDocument.Parse(jsonRaw);
                        var root = doc.RootElement;

                        if (!root.TryGetProperty("@type", out var typeProp) || !typeProp.GetString().Contains("Event"))
                            continue;

                        string title = root.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "Без назви" : "Без назви";
                        string url = root.TryGetProperty("url", out var urlProp) ? urlProp.GetString() ?? "" : "";
                        string imageUrl = root.TryGetProperty("image", out var imgProp) ? imgProp.GetString() ?? "" : "";
                        string startDateRaw = root.TryGetProperty("startDate", out var startProp) ? startProp.GetString() ?? "" : "";
                        
                        string description = root.TryGetProperty("description", out var descProp) ? descProp.GetString() ?? "" : "";
                        if (string.IsNullOrWhiteSpace(description)) description = "Опис доступний на сайті за посиланням.";

                        if (string.IsNullOrEmpty(url)) continue;
                        if (url.StartsWith("/")) url = "https://concert.ua" + url;

                        DateTime? parsedDate = null;
                        if (!string.IsNullOrEmpty(startDateRaw) && DateTime.TryParse(startDateRaw, out var dt))
                        {
                            parsedDate = dt;
                        }

                        string mappedCategory = GuessCategory(url, title);

                        var newEvent = new ScrapedEvent
                        {
                            Title = title,
                            Url = url,
                            Source = ProviderName,
                            Description = description,
                            Date = parsedDate.HasValue ? parsedDate.Value.ToString("dd.MM.yyyy HH:mm") : startDateRaw,
                            ParsedDate = parsedDate,
                            City = citySlug.ToUpper(),
                            CityUk = CityTranslations.GetValueOrDefault(citySlug.ToLower(), citySlug),
                            Category = mappedCategory,
                            ImageUrl = imageUrl
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
                    catch (Exception ex)
                    {
                        _logger.LogDebug("Помилка парсингу окремого блоку JSON-LD: {Msg}", ex.Message);
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

        var statsByCity = allCollectedEvents
            .GroupBy(e => e.CityUk)
            .OrderByDescending(g => g.Count());

        _logger.LogInformation("📌 Розподіл за МІСТАМИ:");
        foreach (var group in statsByCity)
        {
            _logger.LogInformation("   📍 {City}: {Count} подій", group.Key, group.Count());
        }

        _logger.LogInformation("-------------------------------------------------");

        var statsByCategory = allCollectedEvents
            .GroupBy(e => e.Category)
            .OrderByDescending(g => g.Count());

        _logger.LogInformation("📌 Розподіл за КАТЕГОРІЯМИ:");
        foreach (var group in statsByCategory)
        {
            _logger.LogInformation("   🏷️ {Category}: {Count} подій", group.Key.ToUpper(), group.Count());
        }

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