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
        "vinnytsia", "poltava", "zhitomir", "zaporizhzhia", "ternopil",
        "chernivtsy", "chernigiv", "khmelnitsky", "rivne",
        "lutsk", "mykolaiv", "uzhhorod", "kropyvnytskyi"
    };

    private static readonly Dictionary<string, string> CategoryPaths = new()
    {
        { "concerts",  "concerts"  },
        { "theatres",  "theater"   },
        { "stand-up",  "humor"     },
        { "child",     "kids"      },
        { "clubs",     "electronic"},
        { "inshe",     "other"     },
        { "festivals", "festivals" }
    };

    private static readonly Dictionary<string, string> CityTranslations = new(StringComparer.OrdinalIgnoreCase)
    {
        { "kyiv", "Київ" }, { "odesa", "Одеса" }, { "dnipro", "Дніпро" }, { "lviv", "Львів" },
        { "kharkiv", "Харків" }, { "ivano-frankivsk", "Івано-Франківськ" }, { "vinnytsia", "Вінниця" },
        { "poltava", "Полтава" }, { "zhitomir", "Житомир" }, { "zaporizhzhia", "Запоріжжя" },
        { "ternopil", "Тернопіль" }, { "chernivtsy", "Чернівці" }, { "chernigiv", "Чернігів" },
        { "khmelnitsky", "Хмельницький" }, { "rivne", "Рівне" }, { "lutsk", "Луцьк" },
        { "mykolaiv", "Миколаїв" }, { "uzhhorod", "Ужгород" }, { "kropyvnytskyi", "Кропивницький" }
    };

    public ConcertUaScraper(ILogger<ConcertUaScraper> logger)
    {
        _logger = logger;
    }

    public async Task<List<ScrapedEvent>> ScrapeAsync(IBrowser browser)
    {
        var allCollectedEvents = new List<ScrapedEvent>();

        // AllowAutoRedirect = false — щоб 302 не слідував на all-categories і не дублював події
        using var httpClient = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false });
        httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

        _logger.LogInformation("🚀 Початок скрапінгу Concert.ua по категоріях...");

        var tasks = _citySlugs.Select(async citySlug =>
        {
            await _semaphore.WaitAsync();
            _logger.LogInformation("🏙️ Concert.ua: Сканування міста {City}...", citySlug.ToUpper());

            try
            {
                int cityEventsCount = 0;

                foreach (var (categoryKey, categoryPath) in CategoryPaths)
                {
                    string targetUrl = $"https://concert.ua/uk/catalog/{citySlug}/{categoryPath}";

                    HttpResponseMessage response;
                    try
                    {
                        response = await httpClient.GetAsync(targetUrl);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug("Помилка запиту {Url}: {Msg}", targetUrl, ex.Message);
                        continue;
                    }

                    // 302 = немає подій цієї категорії в місті, пропускаємо
                    if (!response.IsSuccessStatusCode)
                    {
                        _logger.LogDebug("⚠️ {City}/{Category}: {Code} — пропускаємо", citySlug, categoryPath, (int)response.StatusCode);
                        continue;
                    }

                    string htmlContent = await response.Content.ReadAsStringAsync();

                    var jsonLdRegex = new Regex(@"<script\s+type=""application/ld\+json"">([\s\S]*?)</script>", RegexOptions.IgnoreCase);
                    var matches = jsonLdRegex.Matches(htmlContent);

                    foreach (Match match in matches)
                    {
                        try
                        {
                            string jsonRaw = match.Groups[1].Value.Trim();
                            using var doc = JsonDocument.Parse(jsonRaw);
                            var root = doc.RootElement;

                            var elementsToProcess = new List<JsonElement>();
                            if (root.ValueKind == JsonValueKind.Array)
                                elementsToProcess.AddRange(root.EnumerateArray());
                            else if (root.ValueKind == JsonValueKind.Object)
                                elementsToProcess.Add(root);

                            foreach (var node in elementsToProcess)
                            {
                                if (!node.TryGetProperty("@type", out var typeProp) ||
                                    !(typeProp.GetString()?.Contains("Event") ?? false))
                                    continue;

                                string title = node.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "Без назви" : "Без назви";
                                string url = node.TryGetProperty("url", out var urlProp) ? urlProp.GetString() ?? "" : "";
                                string imageUrl = node.TryGetProperty("image", out var imgProp) ? imgProp.GetString() ?? "" : "";
                                string startDateRaw = node.TryGetProperty("startDate", out var startProp) ? startProp.GetString() ?? "" : "";
                                string description = node.TryGetProperty("description", out var descProp) ? descProp.GetString() ?? "" : "";
                                if (string.IsNullOrWhiteSpace(description)) description = "Опис доступний на сайті за посиланням.";

                                if (string.IsNullOrEmpty(url)) continue;
                                if (url.StartsWith("/")) url = "https://concert.ua" + url;

                                DateTime? parsedDate = null;
                                if (!string.IsNullOrEmpty(startDateRaw) && DateTime.TryParse(startDateRaw, out var dt))
                                    parsedDate = dt;

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
                                    Category = categoryKey,
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
                        }
                        catch (Exception ex)
                        {
                            _logger.LogDebug("Помилка парсингу JSON-LD блоку: {Msg}", ex.Message);
                        }
                    }
                }

                if (cityEventsCount > 0)
                    _logger.LogInformation("✅ Concert.ua: Отримано {Count} подій для міста {City}", cityEventsCount, citySlug.ToUpper());
                else
                    _logger.LogWarning("⚠️ Concert.ua: Подій не знайдено для міста {City}", citySlug.ToUpper());
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
        foreach (var group in statsByCity)
            _logger.LogInformation("   📍 {City}: {Count} подій", group.Key, group.Count());

        _logger.LogInformation("-------------------------------------------------");

        var statsByCategory = allCollectedEvents.GroupBy(e => e.Category).OrderByDescending(g => g.Count());
        _logger.LogInformation("📌 Розподіл за КАТЕГОРІЯМИ:");
        foreach (var group in statsByCategory)
            _logger.LogInformation("   🏷️ {Category}: {Count} подій", group.Key.ToUpper(), group.Count());

        _logger.LogInformation("=================================================");
        _logger.LogInformation("🏁 Concert.ua: Всього знайдено унікальних подій: {Count}", allCollectedEvents.Count);

        return allCollectedEvents;
    }
}