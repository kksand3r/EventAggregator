using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using EventAggregator.Application.Interfaces;
using EventAggregator.Domain.Models;
using EventAggregator.Application.Parsing;
using Microsoft.Extensions.Logging;
using PuppeteerSharp;

namespace EventAggregator.Infrastructure.Scrapers;

public class ConcertUaScraper : IEventScraper
{
    public string ProviderName => "Concert.ua";
    private readonly ILogger<ConcertUaScraper> _logger;
    // Семафор на рівні міст — 5 міст паралельно
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
        { "child",      "kids"      },
        { "clubs",      "electronic"},
        { "inshe",      "other"     },
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

        string proxyServer = Environment.GetEnvironmentVariable("ProxyServer");
        var handler = new HttpClientHandler { AllowAutoRedirect = false };

        if (!string.IsNullOrEmpty(proxyServer))
        {
            var proxyUri = new Uri(proxyServer);
            var proxy = new WebProxy(proxyUri);
            if (!string.IsNullOrEmpty(proxyUri.UserInfo))
            {
                var parts = proxyUri.UserInfo.Split(':', 2);
                proxy.Credentials = new NetworkCredential(parts[0], parts[1]);
            }
            handler.Proxy = proxy;
            handler.UseProxy = true;
            handler.PreAuthenticate = true;
        }

        using var httpClient = new HttpClient(handler);
        httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

        _logger.LogInformation("🚀 Початок швидкого скрапінгу Concert.ua через API + JSON-LD...");

        var cityTasks = _citySlugs.Select(async citySlug =>
        {
            await _semaphore.WaitAsync();
            string cityLower = citySlug.ToLowerInvariant();
            _logger.LogInformation("🏙️ Concert.ua: Сканування міста {City}...", cityLower.ToUpper());

            try
            {
                // Всі категорії одного міста — паралельно
                var categoryTasks = CategoryPaths.Select(async kvp =>
                {
                    var (categoryKey, categoryPath) = kvp;
                    var localEvents = new List<ScrapedEvent>();
                    string targetUrl = $"https://concert.ua/uk/catalog/{cityLower}/{categoryPath}";

                    HttpResponseMessage response;
                    try
                    {
                        response = await httpClient.GetAsync(targetUrl);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug("Помилка запиту {Url}: {Msg}", targetUrl, ex.Message);
                        return localEvents;
                    }

                    // 302/404 = немає подій цієї категорії в місті
                    if (!response.IsSuccessStatusCode)
                    {
                        return localEvents;
                    }

                    string htmlContent = await response.Content.ReadAsStringAsync();
                    var jsonLdRegex = new Regex(@"<script\s+type=""application/ld\+json"">([\s\S]*?)</script>", RegexOptions.IgnoreCase);

                    foreach (Match match in jsonLdRegex.Matches(htmlContent))
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
                                
                                if (string.IsNullOrWhiteSpace(description)) 
                                    description = "Опис доступний на сайті за посиланням.";
                                else
                                    description = Regex.Replace(description, @"\s+", " ").Trim();

                                if (string.IsNullOrEmpty(url)) continue;
                                if (url.StartsWith("/")) url = "https://concert.ua" + url;

                                // Надійний парсинг ISO дат з збереженням таймзони
                                DateTime finalParsedDate = DateTime.UtcNow.AddDays(2);
                                string displayDate = startDateRaw;

                                if (DateTimeOffset.TryParse(startDateRaw, out var parsedOffset))
                                {
                                    finalParsedDate = parsedOffset.DateTime;
                                    displayDate = parsedOffset.ToString("dd.MM.yyyy HH:mm");
                                }
                                else if (DateTime.TryParse(startDateRaw, out var parsedNet))
                                {
                                    finalParsedDate = parsedNet;
                                    displayDate = parsedNet.ToString("dd.MM.yyyy HH:mm");
                                }

                                var newEvent = new ScrapedEvent
                                {
                                    Title = title.Trim(),
                                    Url = url.Trim(),
                                    Source = ProviderName,
                                    Description = description,
                                    Date = displayDate,
                                    ParsedDate = finalParsedDate,
                                    // Фіксуємо чистий нижній регістр слага для Next.js фільтрів
                                    City = cityLower,
                                    CityUk = CityTranslations.GetValueOrDefault(cityLower, cityLower),
                                    Category = categoryKey,
                                    ImageUrl = imageUrl.Trim(),
                                    ViewsCount = Random.Shared.Next(90, 280) // Виправлено назву поля згідно з моделлю
                                };

                                newEvent.GenerateDeterministicId();
                                localEvents.Add(newEvent);
                            }
                        }
                        catch (Exception)
                        {
                            // Ігноруємо CollectionPage / BreadcrumbList
                        }
                    }

                    return localEvents;
                });

                var results = await Task.WhenAll(categoryTasks);

                int cityEventsCount = 0;
                foreach (var ev in results.SelectMany(r => r))
                {
                    lock (allCollectedEvents)
                    {
                        if (!allCollectedEvents.Any(e => e.Url == ev.Url))
                        {
                            allCollectedEvents.Add(ev);
                            cityEventsCount++;
                        }
                    }
                }

                if (cityEventsCount > 0)
                    _logger.LogInformation("✅ Concert.ua: Отримано {Count} подій для міста {City}", cityEventsCount, cityLower.ToUpper());
            }
            catch (Exception ex)
            {
                _logger.LogError("❌ Помилка збору міста {City}: {Message}", cityLower, ex.Message);
            }
            finally
            {
                _semaphore.Release();
            }
        });

        await Task.WhenAll(cityTasks);

        _logger.LogInformation("🏁 Concert.ua: Збір завершено. Фінальний звіт провайдера:");
        _logger.LogInformation("=================================================");

        var statsByCity = allCollectedEvents.GroupBy(e => e.CityUk).OrderByDescending(g => g.Count());
        _logger.LogInformation("📌 Розподіл за МІСТАМИ:");
        foreach (var group in statsByCity)
            _logger.LogInformation("    📍 {City}: {Count} подій", group.Key, group.Count());

        _logger.LogInformation("-------------------------------------------------");

        var statsByCategory = allCollectedEvents.GroupBy(e => e.Category).OrderByDescending(g => g.Count());
        _logger.LogInformation("📌 Розподіл за КАТЕГОРІЯМИ:");
        foreach (var group in statsByCategory)
            _logger.LogInformation("    🏷️ {Category}: {Count} подій", group.Key.ToUpper(), group.Count());

        _logger.LogInformation("=================================================");
        _logger.LogInformation("🏁 Concert.ua: Всього знайдено унікальних подій: {Count}", allCollectedEvents.Count);

        return allCollectedEvents;
    }
}