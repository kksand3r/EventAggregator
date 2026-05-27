using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using EventAggregator.Application.Interfaces;
using EventAggregator.Domain.Models;
using EventAggregator.Domain.Parsing;
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

            foreach (var city in _citySlugs)
            {
                string formattedCity = CityNormalizer.Normalize(city);
                _logger.LogInformation("🏙️ Karabas.com: Пошук у місті: {City} (JSON-LD)", formattedCity);

                foreach (var category in _categories)
                {
                    int page = 1;
                    bool hasMorePages = true;

                    while (hasMorePages)
                    {
                        if (browser.IsClosed) return allEvents;

                        string htmlContent = ""; // ✅ Оголошуємо тут, щоб бачити в кінці циклу
                        string targetUrl = $"https://{city}.karabas.com/uk/{category}/?time={timeStamp}&page={page}&per-page=20";
                        
                        try
                        {
                            var response = await httpClient.GetAsync(targetUrl);
                            if (!response.IsSuccessStatusCode) break;

                            string jsonString = await response.Content.ReadAsStringAsync();
                            using var doc = JsonDocument.Parse(jsonString);
                            var root = doc.RootElement;

                            if (root.TryGetProperty("content", out var contentEl))
                            {
                                htmlContent = contentEl.GetString() ?? "";
                                var jsonLdRegex = new Regex(@"<script[^>]*type\s*=\s*""application/ld\+json""[^>]*>([\s\S]*?)</script>", RegexOptions.IgnoreCase);
                                var matches = jsonLdRegex.Matches(htmlContent);

                                foreach (Match m in matches)
                                {
                                    try
                                    {
                                        using var ldDoc = JsonDocument.Parse(m.Groups[1].Value.Trim());
                                        var ldRoot = ldDoc.RootElement;
                                        var elements = ldRoot.ValueKind == JsonValueKind.Array ? ldRoot.EnumerateArray() : new[] { ldRoot }.AsEnumerable();

                                        foreach (var node in elements)
                                        {
                                            if (node.TryGetProperty("@type", out var type) && (type.GetString()?.Contains("Event") ?? false))
                                            {
                                                string url = node.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "";
                                                if (string.IsNullOrEmpty(url)) continue;
                                                if (url.StartsWith("/")) url = "https://karabas.com" + url;

                                                lock (allEvents) { if (allEvents.Any(e => e.Url == url)) continue; }

                                                string title = node.TryGetProperty("name", out var n) ? n.GetString() ?? "Без назви" : "Без назви";
                                                string desc = node.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "";
                                                string img = node.TryGetProperty("image", out var i) ? (i.ValueKind == JsonValueKind.String ? i.GetString() : i.TryGetProperty("url", out var iu) ? iu.GetString() : "") : "";
                                                string startDateRaw = node.TryGetProperty("startDate", out var s) ? s.GetString() ?? "" : "";

                                                DateTime parsedDate = DateTime.TryParse(startDateRaw, out var dt) ? dt : DateTime.UtcNow.AddDays(2);

                                                var newEvent = new ScrapedEvent
                                                {
                                                    Title = title.Trim(),
                                                    Url = url.Trim(),
                                                    Source = ProviderName,
                                                    Description = desc.Replace("ПОКАЗАТИ ЩЕ", "").Trim(),
                                                    Date = parsedDate.ToString("dd.MM.yyyy HH:mm"),
                                                    ParsedDate = parsedDate,
                                                    City = formattedCity,
                                                    CityUk = CityTranslations.GetValueOrDefault(city, city),
                                                    Category = category,
                                                    ImageUrl = img.Trim(),
                                                    ViewsCount = Random.Shared.Next(110, 340)
                                                };

                                                newEvent.GenerateDeterministicId();
                                                lock (allEvents) { allEvents.Add(newEvent); }
                                            }
                                        }
                                    }
                                    catch { }
                                }
                            }

                            hasMorePages = htmlContent.Contains("data-pagination-load-more");
                            if (hasMorePages) page++;
                            await Task.Delay(Random.Shared.Next(600, 1200));
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