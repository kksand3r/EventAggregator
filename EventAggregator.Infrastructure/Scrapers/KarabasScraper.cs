using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using EventAggregator.Application.Interfaces;
using EventAggregator.Domain.Models;
using Microsoft.Extensions.Logging;
using PuppeteerSharp;

namespace EventAggregator.Infrastructure.Scrapers;

public class KarabasScraper : IEventScraper
{
    public string ProviderName => "Karabas.com";
    private readonly ILogger<KarabasScraper> _logger;

    private readonly string[] _citySlugs = 
    {
        "kyiv", "odesa", "dnipro", "lviv", "kharkiv", "ivano-frankivsk",
        "vinnytsia", "poltava", "zhytomyr", "zaporizhzhia", "ternopil",
        "chernivtsi", "chernihiv", "sumy", "khmelnytskyi", "rivne",
        "lutsk", "mykolaiv", "uzhhorod", "kropyvnytskyi"
    };

    private readonly string[] _categories =
        { "concerts", "theatres", "stand-up", "child", "clubs", "inshe", "festivals" };

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

    public KarabasScraper(ILogger<KarabasScraper> logger) => _logger = logger;
    
    private TimeZoneInfo GetKyivTimeZone()
    {
        try 
        { 
            return TimeZoneInfo.FindSystemTimeZoneById("Europe/Kyiv"); 
        }
        catch 
        { 
            return TimeZoneInfo.FindSystemTimeZoneById("FLE Standard Time"); 
        }
    }

    public async Task<List<ScrapedEvent>> ScrapeAsync(IBrowser browser)
    {
        var allEvents = new List<ScrapedEvent>();
        string proxyServer = Environment.GetEnvironmentVariable("ProxyServer");
        var handler = new HttpClientHandler();

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

        using (var httpClient = new HttpClient(handler))
        {
            httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
            httpClient.DefaultRequestHeaders.Add("X-Requested-With", "XMLHttpRequest");
            httpClient.DefaultRequestHeaders.Add("Accept", "application/json, text/javascript, */*; q=0.01");
            long timeStamp = new DateTimeOffset(DateTime.UtcNow.Date).ToUnixTimeSeconds();

            _logger.LogInformation("🚀 Початок скрапінгу {Provider} по категоріях...", ProviderName);

            foreach (var city in _citySlugs)
            {
                string cityLower = city.ToLowerInvariant();
                _logger.LogInformation("🏙️ {Provider}: Сканування міста {City}...", ProviderName, cityLower.ToUpper());
                
                int eventsBeforeCity = allEvents.Count;

                foreach (var category in _categories)
                {
                    int page = 1;
                    bool hasMorePages = true;

                    while (hasMorePages)
                    {
                        if (browser.IsClosed) return allEvents;

                        string targetUrl = $"https://{cityLower}.karabas.com/uk/{category}/?time={timeStamp}&page={page}&per-page=20";
                        try
                        {
                            var response = await httpClient.GetAsync(targetUrl);
                            if (!response.IsSuccessStatusCode)
                            {
                                _logger.LogDebug("⚠️ Помилка API {Code} для {Url}", response.StatusCode, targetUrl);
                                break;
                            }

                            string jsonString = await response.Content.ReadAsStringAsync();
                            using var doc = JsonDocument.Parse(jsonString);
                            var root = doc.RootElement;

                            if (root.TryGetProperty("content", out var contentEl))
                            {
                                string htmlContent = contentEl.GetString() ?? "";
                                var jsonLdRegex = new Regex(@"<script[^>]*type\s*=\s*""application/ld\+json""[^>]*>([\s\S]*?)</script>", RegexOptions.IgnoreCase);
                                var matches = jsonLdRegex.Matches(htmlContent);

                                int parsedOnPageCount = 0;

                                foreach (Match m in matches)
                                {
                                    try
                                    {
                                        string jsonLdBody = m.Groups[1].Value.Trim();
                                        using var ldDoc = JsonDocument.Parse(jsonLdBody);
                                        var ldRoot = ldDoc.RootElement;

                                        if (ldRoot.TryGetProperty("@type", out var typeEl))
                                        {
                                            string type = typeEl.GetString() ?? "";
                                            if (type.Contains("Event") || type == "Festival")
                                            {
                                                string url = ldRoot.TryGetProperty("url", out var urlEl) ? urlEl.GetString() ?? "" : "";
                                                string title = ldRoot.TryGetProperty("name", out var nameEl) ? nameEl.GetString() ?? "" : "";
                                                string description = ldRoot.TryGetProperty("description", out var descEl) ? descEl.GetString() ?? "" : "";
                                                
                                                string imageUrl = "";
                                                if (ldRoot.TryGetProperty("image", out var imgEl))
                                                {
                                                    if (imgEl.ValueKind == JsonValueKind.Object && imgEl.TryGetProperty("url", out var imgUrlEl))
                                                        imageUrl = imgUrlEl.GetString() ?? "";
                                                    else if (imgEl.ValueKind == JsonValueKind.String)
                                                        imageUrl = imgEl.GetString() ?? "";
                                                }

                                                string startDateStr = ldRoot.TryGetProperty("startDate", out var dateEl) ? dateEl.GetString() ?? "" : "";

                                                if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(title)) continue;
                                                if (url.StartsWith("/")) url = "https://karabas.com" + url;

                                                if (!string.IsNullOrEmpty(description))
                                                {
                                                    description = description
                                                        .Replace("ПОКАЗАТИ ЩЕ", "")
                                                        .Replace("Опис на сайті", "")
                                                        .Replace("Опис відсутній", "");
                                                    description = Regex.Replace(description, @"\s+", " ").Trim();
                                                }

                                                DateTime finalParsedDate = DateTime.UtcNow.AddDays(2); 
                                                string displayDate = startDateStr;

                                                if (DateTimeOffset.TryParse(startDateStr, out var parsedOffset))
                                                {
                                                    // Примусово конвертуємо час у Київський часовий пояс
                                                    var kyivTime = TimeZoneInfo.ConvertTime(parsedOffset, GetKyivTimeZone());
                                                    finalParsedDate = kyivTime.DateTime;
                                                    displayDate = kyivTime.ToString("dd.MM.yyyy HH:mm");
                                                }
                                                else if (DateTime.TryParse(startDateStr, out var parsedNet))
                                                {
                                                    finalParsedDate = parsedNet;
                                                    displayDate = parsedNet.ToString("dd.MM.yyyy HH:mm");
                                                }

                                                lock (allEvents)
                                                {
                                                    if (!allEvents.Any(x => x.Url == url))
                                                    {
                                                        var newEvent = new ScrapedEvent
                                                        {
                                                            Title = title.Trim(),
                                                            Url = url.Trim(),
                                                            Source = ProviderName,
                                                            Description = description,
                                                            Date = displayDate, 
                                                            ParsedDate = finalParsedDate,
                                                            City = cityLower, 
                                                            CityUk = CityTranslations.GetValueOrDefault(cityLower, cityLower),
                                                            Category = category,
                                                            ImageUrl = imageUrl.Trim()
                                                        };

                                                        newEvent.GenerateDeterministicId();
                                                        allEvents.Add(newEvent);
                                                        parsedOnPageCount++;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    catch (Exception)
                                    {
                                        // Ігноруємо CollectionPage / BreadcrumbList
                                    }
                                }

                                if (parsedOnPageCount > 0)
                                {
                                    _logger.LogInformation("📦 {Provider}: Знайдено {Count} подій на сторінці {Page} ({Category})", ProviderName, parsedOnPageCount, page, category.ToUpper());
                                }
                            }

                            hasMorePages = false;
                            if (root.TryGetProperty("pagination", out var pagEl))
                            {
                                string pagHtml = pagEl.GetString() ?? "";
                                if (pagHtml.Contains("data-pagination-load-more"))
                                {
                                    hasMorePages = true;
                                    page++;
                                    await Task.Delay(Random.Shared.Next(600, 1200));
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogDebug("⚠️ Помилка збору {Url}: {Msg}", targetUrl, ex.Message);
                            hasMorePages = false;
                        }
                    }
                    await Task.Delay(Random.Shared.Next(800, 1500));
                }

                int eventsAddedForCity = allEvents.Count - eventsBeforeCity;
                if (eventsAddedForCity > 0)
                    _logger.LogInformation("✅ {Provider}: Отримано {Count} подій для міста {City}", ProviderName, eventsAddedForCity, cityLower.ToUpper());
                else
                    _logger.LogWarning("⚠️ {Provider}: Подій не знайдено для міста {City}", ProviderName, cityLower.ToUpper());
            }
        }

        _logger.LogInformation("🏁 {Provider}: Збір завершено. Фінальний звіт провайдера:", ProviderName);
        _logger.LogInformation("=================================================");

        var statsByCity = allEvents.GroupBy(e => e.CityUk).OrderByDescending(g => g.Count());
        _logger.LogInformation("📌 Розподіл за МІСТАМИ:");
        foreach (var group in statsByCity)
            _logger.LogInformation("   📍 {City}: {Count} подій", group.Key, group.Count());

        _logger.LogInformation("-------------------------------------------------");

        var statsByCategory = allEvents.GroupBy(e => e.Category).OrderByDescending(g => g.Count());
        _logger.LogInformation("📌 Розподіл за КАТЕГОРІЯМИ:");
        foreach (var group in statsByCategory)
            _logger.LogInformation("   🏷️ {Category}: {Count} подій", group.Key.ToUpper(), group.Count());

        _logger.LogInformation("=================================================");
        _logger.LogInformation("🏁 {Provider}: Всього знайдено унікальних подій: {Count}", ProviderName, allEvents.Count);

        return allEvents;
    }
}