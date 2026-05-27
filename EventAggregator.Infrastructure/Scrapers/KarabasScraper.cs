using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using EventAggregator.Application.Interfaces;
using EventAggregator.Domain.Models;
using EventAggregator.Application.Parsing;
using Microsoft.Extensions.Logging;
using PuppeteerSharp;

namespace EventAggregator.Infrastructure.Scrapers;

public class KarabasScraper : IEventScraper
{
    public string ProviderName => "Karabas.com";
    private readonly ILogger<KarabasScraper> _logger;

    private readonly string[] _citySlugs =
    {
        "uzhhorod" // "kyiv", "odesa", "dnipro", "lviv", "kharkiv", "ivano-frankivsk",
        //"vinnytsia", "poltava", "zhytomyr", "zaporizhzhia", "ternopil",
        //"chernivtsi", "chernihiv", "sumy", "khmelnytskyi", "rivne",
        //"lutsk", "mykolaiv", "uzhhorod", "kropyvnytskyi"
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
            httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/122.0.0.0 Safari/537.36");
            httpClient.DefaultRequestHeaders.Add("X-Requested-With", "XMLHttpRequest");
            httpClient.DefaultRequestHeaders.Add("Accept", "application/json, text/javascript, */*; q=0.01");
            long timeStamp = new DateTimeOffset(DateTime.UtcNow.Date).ToUnixTimeSeconds();

            foreach (var city in _citySlugs)
            {
                string cityLower = city.ToLowerInvariant();
                // Робимо формат з великої літери для Elasticsearch (напр. "Uzhhorod")
                string formattedCity = cityLower.Substring(0, 1).ToUpper() + cityLower.Substring(1);
                _logger.LogInformation("🏙️ Karabas.com: Пошук у місті: {City} (через API + JSON-LD)", formattedCity);

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
                                _logger.LogWarning("⚠️ Помилка API {Code} для {Url}", response.StatusCode, targetUrl);
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
                                                    finalParsedDate = parsedOffset.DateTime;
                                                    displayDate = parsedOffset.ToString("dd.MM.yyyy HH:mm");
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
                                                            // ЗБЕРІГАЄМО З ВЕЛИКОЇ ЛІТЕРИ
                                                            City = formattedCity, 
                                                            CityUk = CityTranslations.GetValueOrDefault(cityLower, formattedCity),
                                                            Category = category,
                                                            ImageUrl = imageUrl.Trim(),
                                                            ViewsCount = Random.Shared.Next(110, 340)
                                                        };

                                                        newEvent.GenerateDeterministicId();
                                                        allEvents.Add(newEvent);
                                                        parsedOnPageCount++;
                                                        _logger.LogInformation("✅ Karabas (JSON-LD): {Title} [{City}]", newEvent.Title, newEvent.City);
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
                                    _logger.LogInformation("📦 Парсер знайшов {Count} подій з описом на Сторінці {Page} ({Category})", parsedOnPageCount, page, category);
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
                            _logger.LogWarning("⚠️ Помилка збору {Url}: {Msg}", targetUrl, ex.Message);
                            hasMorePages = false;
                        }
                    }
                    await Task.Delay(Random.Shared.Next(800, 1500));
                }
            }
        }

        return allEvents;
    }
}