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

    // Максимум 5 міст паралельно
    private readonly SemaphoreSlim _semaphore = new(5);

    private readonly string[] _citySlugs =
    {
        "uzhhorod"
        // "kyiv", "odesa", "dnipro", "lviv", "kharkiv", "ivano-frankivsk",
        // "vinnytsia", "poltava", "zhytomyr", "zaporizhzhia", "ternopil",
        // "chernivtsi", "chernihiv", "sumy", "khmelnytskyi", "rivne",
        // "lutsk", "mykolaiv", "kropyvnytskyi"
    };

    private static readonly Dictionary<string, string> CategoryPaths = new()
    {
        { "concerts",  "concerts"   },
        { "theatres",  "theater"    },
        { "stand-up",  "humor"      },
        { "child",     "kids"       },
        { "clubs",     "electronic" },
        { "inshe",     "other"      },
        { "festivals", "festivals"  }
    };

    private static readonly Dictionary<string, string> CityTranslations = new(StringComparer.OrdinalIgnoreCase)
    {
        { "kyiv", "Київ" },
        { "odesa", "Одеса" },
        { "dnipro", "Дніпро" },
        { "lviv", "Львів" },
        { "kharkiv", "Харків" },
        { "ivano-frankivsk", "Івано-Франківськ" },
        { "vinnytsia", "Вінниця" },
        { "poltava", "Полтава" },
        { "zhytomyr", "Житомир" },
        { "zaporizhzhia", "Запоріжжя" },
        { "ternopil", "Тернопіль" },
        { "chernivtsi", "Чернівці" },
        { "chernihiv", "Чернігів" },
        { "sumy", "Суми" },
        { "khmelnytskyi", "Хмельницький" },
        { "rivne", "Рівне" },
        { "lutsk", "Луцьк" },
        { "mykolaiv", "Миколаїв" },
        { "uzhhorod", "Ужгород" },
        { "kropyvnytskyi", "Кропивницький" }
    };

    public ConcertUaScraper(ILogger<ConcertUaScraper> logger)
    {
        _logger = logger;
    }

    public async Task<List<ScrapedEvent>> ScrapeAsync(IBrowser browser)
    {
        var allCollectedEvents = new List<ScrapedEvent>();

        using var httpClient = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = false
        });

        httpClient.DefaultRequestHeaders.Add(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        );

        _logger.LogInformation("🚀 Concert.ua: старт скрапінгу...");

        var cityTasks = _citySlugs.Select(async citySlug =>
        {
            await _semaphore.WaitAsync();

            try
            {
                string cityLower = citySlug.ToLowerInvariant();

                _logger.LogInformation(
                    "🏙️ Concert.ua: скануємо місто {City}",
                    cityLower.ToUpper()
                );

                var categoryTasks = CategoryPaths.Select(async categoryItem =>
                {
                    var localEvents = new List<ScrapedEvent>();

                    string categoryKey = categoryItem.Key;
                    string categoryPath = categoryItem.Value;

                    string targetUrl =
                        $"https://concert.ua/uk/catalog/{cityLower}/{categoryPath}";

                    try
                    {
                        var response = await httpClient.GetAsync(targetUrl);

                        // Concert.ua часто повертає 302 якщо подій нема
                        if (!response.IsSuccessStatusCode)
                        {
                            _logger.LogDebug(
                                "⚠️ {City}/{Category}: {Code}",
                                cityLower,
                                categoryKey,
                                (int)response.StatusCode
                            );

                            return localEvents;
                        }

                        string htmlContent =
                            await response.Content.ReadAsStringAsync();

                        var jsonLdRegex = new Regex(
                            @"<script\s+type=""application/ld\+json"">([\s\S]*?)</script>",
                            RegexOptions.IgnoreCase
                        );

                        var matches = jsonLdRegex.Matches(htmlContent);

                        int parsedCount = 0;

                        foreach (Match match in matches)
                        {
                            try
                            {
                                string jsonRaw =
                                    match.Groups[1].Value.Trim();

                                using var doc = JsonDocument.Parse(jsonRaw);

                                var root = doc.RootElement;

                                var elements = new List<JsonElement>();

                                if (root.ValueKind == JsonValueKind.Array)
                                {
                                    elements.AddRange(root.EnumerateArray());
                                }
                                else if (root.ValueKind == JsonValueKind.Object)
                                {
                                    elements.Add(root);
                                }

                                foreach (var node in elements)
                                {
                                    if (!node.TryGetProperty("@type", out var typeProp))
                                        continue;

                                    string type =
                                        typeProp.GetString() ?? "";

                                    if (!type.Contains("Event"))
                                        continue;

                                    string title =
                                        node.TryGetProperty("name", out var nameProp)
                                            ? nameProp.GetString() ?? "Без назви"
                                            : "Без назви";

                                    string url =
                                        node.TryGetProperty("url", out var urlProp)
                                            ? urlProp.GetString() ?? ""
                                            : "";

                                    if (string.IsNullOrWhiteSpace(url))
                                        continue;

                                    if (url.StartsWith("/"))
                                    {
                                        url = "https://concert.ua" + url;
                                    }

                                    string imageUrl = "";

                                    if (node.TryGetProperty("image", out var imgProp))
                                    {
                                        if (imgProp.ValueKind == JsonValueKind.String)
                                        {
                                            imageUrl = imgProp.GetString() ?? "";
                                        }
                                        else if (imgProp.ValueKind == JsonValueKind.Array)
                                        {
                                            imageUrl = imgProp
                                                .EnumerateArray()
                                                .FirstOrDefault()
                                                .GetString() ?? "";
                                        }
                                    }

                                    string startDateRaw =
                                        node.TryGetProperty("startDate", out var dateProp)
                                            ? dateProp.GetString() ?? ""
                                            : "";

                                    string description =
                                        node.TryGetProperty("description", out var descProp)
                                            ? descProp.GetString() ?? ""
                                            : "";

                                    if (string.IsNullOrWhiteSpace(description))
                                    {
                                        description =
                                            "Опис доступний на сайті за посиланням.";
                                    }

                                    description = Regex
                                        .Replace(description, @"\s+", " ")
                                        .Trim();

                                    DateTime? parsedDate = null;
                                    string displayDate = startDateRaw;

                                    if (DateTimeOffset.TryParse(startDateRaw, out var dto))
                                    {
                                        parsedDate = dto.DateTime;
                                        displayDate = dto.ToString("dd.MM.yyyy HH:mm");
                                    }
                                    else if (DateTime.TryParse(startDateRaw, out var dt))
                                    {
                                        parsedDate = dt;
                                        displayDate = dt.ToString("dd.MM.yyyy HH:mm");
                                    }

                                    var newEvent = new ScrapedEvent
                                    {
                                        Title = title.Trim(),
                                        Url = url.Trim(),
                                        Source = ProviderName,
                                        Description = description,
                                        Date = displayDate,
                                        ParsedDate = parsedDate,

                                        // БЕЗ CityNormalizer
                                        City = cityLower,

                                        CityUk = CityTranslations.GetValueOrDefault(
                                            cityLower,
                                            cityLower
                                        ),

                                        Category = categoryKey,
                                        ImageUrl = imageUrl.Trim(),

                                        ViewsCount = Random.Shared.Next(100, 300)
                                    };

                                    newEvent.GenerateDeterministicId();

                                    localEvents.Add(newEvent);
                                    parsedCount++;
                                }
                            }
                            catch (Exception ex)
                            {
                                _logger.LogDebug(
                                    "❌ Concert.ua JSON-LD parse error: {Msg}",
                                    ex.Message
                                );
                            }
                        }

                        if (parsedCount > 0)
                        {
                            _logger.LogInformation(
                                "✅ Concert.ua [{City}] [{Category}] -> {Count} events",
                                cityLower.ToUpper(),
                                categoryKey,
                                parsedCount
                            );
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(
                            "⚠️ Concert.ua request error {Url}: {Msg}",
                            targetUrl,
                            ex.Message
                        );
                    }

                    return localEvents;
                });

                var categoryResults = await Task.WhenAll(categoryTasks);

                int cityCount = 0;

                foreach (var ev in categoryResults.SelectMany(x => x))
                {
                    lock (allCollectedEvents)
                    {
                        if (!allCollectedEvents.Any(e => e.Url == ev.Url))
                        {
                            allCollectedEvents.Add(ev);
                            cityCount++;
                        }
                    }
                }

                if (cityCount > 0)
                {
                    _logger.LogInformation(
                        "📦 Concert.ua: {Count} унікальних подій для {City}",
                        cityCount,
                        cityLower.ToUpper()
                    );
                }
                else
                {
                    _logger.LogWarning(
                        "⚠️ Concert.ua: подій не знайдено для {City}",
                        cityLower.ToUpper()
                    );
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    "❌ Concert.ua city error {City}: {Msg}",
                    citySlug,
                    ex.Message
                );
            }
            finally
            {
                _semaphore.Release();
            }
        });

        await Task.WhenAll(cityTasks);

        _logger.LogInformation("=================================================");
        _logger.LogInformation("🏁 Concert.ua scraping finished");
        _logger.LogInformation("📊 Total unique events: {Count}", allCollectedEvents.Count);

        var byCity = allCollectedEvents
            .GroupBy(e => e.CityUk)
            .OrderByDescending(g => g.Count());

        _logger.LogInformation("📌 By cities:");

        foreach (var group in byCity)
        {
            _logger.LogInformation(
                "   📍 {City}: {Count}",
                group.Key,
                group.Count()
            );
        }

        var byCategory = allCollectedEvents
            .GroupBy(e => e.Category)
            .OrderByDescending(g => g.Count());

        _logger.LogInformation("📌 By categories:");

        foreach (var group in byCategory)
        {
            _logger.LogInformation(
                "   🏷️ {Category}: {Count}",
                group.Key,
                group.Count()
            );
        }

        _logger.LogInformation("=================================================");

        return allCollectedEvents;
    }
}