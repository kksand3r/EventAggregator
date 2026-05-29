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

        using var httpClient = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false });
        httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

        _logger.LogInformation("🚀 Початок скрапінгу {Provider} по категоріях...", ProviderName);

        var cityTasks = _citySlugs.Select(async citySlug =>
        {
            await _semaphore.WaitAsync();
            _logger.LogInformation("🏙️ {Provider}: Сканування міста {City}...", ProviderName, citySlug.ToUpper());

            try
            {
                var categoryTasks = CategoryPaths.Select(async kvp =>
                {
                    var (categoryKey, categoryPath) = kvp;
                    var localEvents = new List<ScrapedEvent>();
                    string targetUrl = $"https://concert.ua/uk/catalog/{citySlug}/{categoryPath}";

                    HttpResponseMessage response;
                    try { response = await httpClient.GetAsync(targetUrl); }
                    catch { return localEvents; }

                    if (!response.IsSuccessStatusCode) return localEvents;

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
                                if (!node.TryGetProperty("@type", out var typeProp) || !(typeProp.GetString()?.Contains("Event") ?? false))
                                    continue;

                                string title = node.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? "Без назви" : "Без назви";
                                string url = node.TryGetProperty("url", out var urlProp) ? urlProp.GetString() ?? "" : "";
                                string startDateRaw = node.TryGetProperty("startDate", out var startProp) ? startProp.GetString() ?? "" : "";
                                string description = node.TryGetProperty("description", out var descProp) ? descProp.GetString() ?? "" : "";
                                if (string.IsNullOrWhiteSpace(description)) description = "Опис доступний на сайті за посиланням.";

                                if (string.IsNullOrEmpty(url)) continue;
                                if (url.StartsWith("/")) url = "https://concert.ua" + url;
                                
                                string imageUrl = "";
                                if (node.TryGetProperty("image", out var imgProp))
                                {
                                    if (imgProp.ValueKind == JsonValueKind.String) imageUrl = imgProp.GetString() ?? "";
                                    else if (imgProp.ValueKind == JsonValueKind.Array) imageUrl = imgProp.EnumerateArray().FirstOrDefault().GetString() ?? "";
                                }

                                // ==========================================
                                // ВИПРАВЛЕННЯ ЧАСОВОГО ПОЯСУ CONCERT.UA
                                // ==========================================
                                DateTime? parsedDate = null;
                                string displayDate = startDateRaw;

                                if (!string.IsNullOrEmpty(startDateRaw) && DateTimeOffset.TryParse(startDateRaw, out var dto))
                                {
                                    // Concert.ua віддає правильний локальний час у властивості DateTime
                                    DateTime localClockTime = dto.DateTime;
                                    parsedDate = localClockTime.AddHours(-3); // Зберігаємо як UTC
                                    displayDate = localClockTime.ToString("dd.MM.yyyy HH:mm");
                                }
                                else if (!string.IsNullOrEmpty(startDateRaw) && DateTime.TryParse(startDateRaw, out var dt))
                                {
                                    parsedDate = dt.AddHours(-3);
                                    displayDate = dt.ToString("dd.MM.yyyy HH:mm");
                                }

                                var newEvent = new ScrapedEvent
                                {
                                    Title = title,
                                    Url = url,
                                    Source = ProviderName,
                                    Description = description,
                                    Date = displayDate,
                                    ParsedDate = parsedDate,
                                    City = citySlug.ToLowerInvariant(),
                                    CityUk = CityTranslations.GetValueOrDefault(citySlug.ToLowerInvariant(), citySlug),
                                    Category = categoryKey,
                                    ImageUrl = imageUrl
                                };

                                newEvent.GenerateDeterministicId();
                                localEvents.Add(newEvent);
                            }
                        }
                        catch { }
                    }
                    return localEvents;
                });

                var results = await Task.WhenAll(categoryTasks);

                foreach (var ev in results.SelectMany(r => r))
                {
                    lock (allCollectedEvents)
                    {
                        if (!allCollectedEvents.Any(e => e.Url == ev.Url))
                            allCollectedEvents.Add(ev);
                    }
                }
            }
            finally { _semaphore.Release(); }
        });

        await Task.WhenAll(cityTasks);
        return allCollectedEvents;
    }
}