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

    // Регулярка для миттєвого вирізання прихованого блоку Google-структури (JSON-LD)
    private static readonly Regex LdJsonRegex = new(
        @"<script\s+type=""application/ld\+json"">\s*({.*?})\s*</script>", 
        RegexOptions.Singleline | RegexOptions.Compiled | RegexOptions.IgnoreCase
    );

    public KarabasScraper(ILogger<KarabasScraper> logger) => _logger = logger;

    public async Task<List<ScrapedEvent>> ScrapeAsync(IBrowser browser)
    {
        var allEvents = new List<ScrapedEvent>();
        
        string proxyServer = Environment.GetEnvironmentVariable("ProxyServer");
        var handler = new HttpClientHandler();
        
        if (!string.IsNullOrEmpty(proxyServer))
        {
            handler.Proxy = new WebProxy(proxyServer);
            handler.UseProxy = true;
        }

        using (var httpClient = new HttpClient(handler))
        {
            httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
            httpClient.DefaultRequestHeaders.Add("X-Requested-With", "XMLHttpRequest");
            httpClient.DefaultRequestHeaders.Add("Accept", "application/json, text/javascript, */*; q=0.01");
            
            long timeStamp = new DateTimeOffset(DateTime.UtcNow.Date).ToUnixTimeSeconds();

            foreach (var city in _citySlugs)
            {
                _logger.LogInformation("🏙️ Karabas.com: Пошук у місті: {City} (через JSON-LD)", city.ToUpper());
                var cityUk = CityTranslations.GetValueOrDefault(city.ToLower(), city);

                foreach (var category in _categories)
                {
                    int page = 1;
                    bool hasMorePages = true;

                    while (hasMorePages)
                    {
                        string targetUrl = $"https://{city}.karabas.com/uk/{category}/?time={timeStamp}&page={page}&per-page=20";
                        
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
                                var matchedEventsInPage = 0;

                                // 🎯 ШУКАЄМО ЗОЛОТУ ЖИЛУ: Витягуємо JSON-LD блоки з HTML контенту сторінки
                                var ldMatches = LdJsonRegex.Matches(htmlContent);
                                foreach (Match match in ldMatches)
                                {
                                    try
                                    {
                                        var jsonText = match.Groups[1].Value;
                                        using var ldDoc = JsonDocument.Parse(jsonText);
                                        var ldRoot = ldDoc.RootElement;

                                        // Нам потрібна суто сторінка списку, яка містить структуру CollectionPage
                                        if (!ldRoot.TryGetProperty("@type", out var typeProp) || typeProp.GetString() != "CollectionPage") 
                                            continue;

                                        if (ldRoot.TryGetProperty("mainEntity", out var mainEntity) &&
                                            mainEntity.TryGetProperty("itemListElement", out var elements) &&
                                            elements.ValueKind == JsonValueKind.Array)
                                        {
                                            foreach (var element in elements.EnumerateArray())
                                            {
                                                if (element.TryGetProperty("item", out var item))
                                                {
                                                    var title = item.TryGetProperty("name", out var n) ? n.GetString() : "";
                                                    var url = item.TryGetProperty("url", out var u) ? u.GetString() : "";
                                                    var startDateRaw = item.TryGetProperty("startDate", out var sd) ? sd.GetString() : "";

                                                    if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(url)) 
                                                    {
                                                        continue;
                                                    }

                                                    if (url.StartsWith("/")) url = "https://karabas.com" + url;

                                                    // 📅 Розбір дати з ISO 8601 ("2026-05-30T22:00:00+03:00")
                                                    DateTime? parsedDate = null;
                                                    string displayDate = startDateRaw;

                                                    if (DateTime.TryParse(startDateRaw, out var dt))
                                                    {
                                                        parsedDate = dt.ToUniversalTime(); // UTC для Elasticsearch
                                                        displayDate = dt.ToString("dd.MM.yyyy HH:mm"); // Гарний вигляд для фронта
                                                    }

                                                    var newEvent = new ScrapedEvent
                                                    {
                                                        Title = title.Trim().Replace("\n", " "),
                                                        Url = url,
                                                        Source = ProviderName,
                                                        Description = "Опис доступний на сайті за посиланням.", // Фолбек
                                                        Date = displayDate,
                                                        ParsedDate = parsedDate,
                                                        City = city.ToUpper(),
                                                        CityUk = cityUk,
                                                        Category = category,
                                                        ImageUrl = "" // На рівні списку Карабас не дає постер у JSON-LD, залишаємо фолбек
                                                    };

                                                    newEvent.GenerateDeterministicId();

                                                    lock (allEvents)
                                                    {
                                                        if (!allEvents.Any(x => x.Id == newEvent.Id))
                                                        {
                                                            allEvents.Add(newEvent);
                                                            matchedEventsInPage++;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    catch (Exception ldEx)
                                    {
                                        _logger.LogDebug("Парсинг JSON-LD блоку пропущено: {Msg}", ldEx.Message);
                                    }
                                }

                                if (matchedEventsInPage > 0)
                                {
                                    _logger.LogInformation("   ✅ Отримано {Count} чистих подій з {Category} (Сторінка {Page})", matchedEventsInPage, category, page);
                                }
                            }

                            // 🔄 ПЕРЕВІРКА ПАГІНАЦІЇ
                            hasMorePages = false;
                            if (root.TryGetProperty("pagination", out var pagEl))
                            {
                                string pagHtml = pagEl.GetString() ?? "";
                                if (pagHtml.Contains("data-pagination-load-more"))
                                {
                                    hasMorePages = true;
                                    page++;
                                    await Task.Delay(Random.Shared.Next(300, 700)); // Легка пауза, щоб не нахабніти
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning("⚠️ Помилка збору {Url}: {Msg}", targetUrl, ex.Message);
                            hasMorePages = false;
                        }
                    }
                    
                    await Task.Delay(Random.Shared.Next(400, 800));
                }
            }
        }

        _logger.LogInformation("🏁 Karabas.com: Скрайпінг успішно завершено! Знайдено унікальних подій: {Count}", allEvents.Count);
        return allEvents;
    }
}