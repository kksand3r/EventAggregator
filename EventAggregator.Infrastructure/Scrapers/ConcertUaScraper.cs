using System.Text.Json;
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
    private readonly SemaphoreSlim _semaphore = new(4);

    private readonly string[] _citySlugs =
    {
        "uzhhorod", "kropyvnytskyi"// "dnipro", "lviv", "kharkiv", "ivano-frankivsk",
        //"vinnytsia", "poltava", "zhytomyr", "zaporizhzhia", "ternopil",
        //"chernivtsi", "chernihiv", "sumy", "khmelnytskyi", "rivne",
        //"lutsk", "mykolaiv", "uzhhorod", "kropyvnytskyi"
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
        using var mainPage = await browser.NewPageAsync();
        await mainPage.SetUserAgentAsync(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

        var eventLinks = new List<(string Title, string Url, string CitySlug)>();

        foreach (var citySlug in _citySlugs)
        {
            _logger.LogInformation("🏙️ Concert.ua: Пошук у місті: {City}", citySlug.ToUpper());
            try
            {
                await mainPage.GoToAsync($"https://concert.ua/uk/{citySlug}", WaitUntilNavigation.Networkidle2);

                var links = await mainPage.EvaluateFunctionAsync<JsonElement[]>(@"() => {
                    return Array.from(document.querySelectorAll('a[href*=""/event/""]'))
                        .map(card => ({
                            title: card.innerText.split('\n')[0].trim(),
                            url: card.getAttribute('href')
                        })).filter(e => e.title.length > 2);
                }");

                foreach (var link in links)
                {
                    string rawUrl = link.GetProperty("url").GetString() ?? "";
                    if (string.IsNullOrEmpty(rawUrl)) continue;

                    string fullUrl = rawUrl.StartsWith("http") ? rawUrl : "https://concert.ua" + rawUrl.Split('?')[0];
                    if (!eventLinks.Any(x => x.Url == fullUrl))
                    {
                        eventLinks.Add((link.GetProperty("title").GetString() ?? "Без назви", fullUrl, citySlug));
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError("❌ Помилка списку {City}: {Message}", citySlug, ex.Message);
            }
        }

        _logger.LogInformation("🚀 Concert.ua: Детальний збір {Count} подій...", eventLinks.Count);

        var tasks = eventLinks.Select(async item =>
        {
            await _semaphore.WaitAsync();
            try
            {
                using var page = await browser.NewPageAsync();
                await page.GoToAsync(item.Url, WaitUntilNavigation.Load);

                var details = await page.EvaluateFunctionAsync<JsonElement>(@"() => {
                    const clean = (text) => text ? text.replace(/[\u00A0\t\r\n]+/g, ' ').replace(/\s\s+/g, ' ').trim() : '';
                    const getTxt = (sel) => document.querySelector(sel)?.innerText || '';

                    const categoryEl = document.querySelector('.event-main-info-tags__item');
                    const category = clean(categoryEl?.innerText) || 'Подія';

                    const imgEl = document.querySelector('picture.promo-events-slider-item__img img') 
                               || document.querySelector('.event-page-top img') 
                               || document.querySelector('img.promo-events-slider-item__img')
                               || document.querySelector('meta[property=""og:image""]');
                    
                    let imageUrl = '';
                    if (imgEl) {
                        imageUrl = imgEl.tagName === 'META' ? imgEl.getAttribute('content') : imgEl.src;
                    }

                    return {
                        Description: clean(getTxt('.event-content__description, .common-text, [class*=""description""]')) || 'Опис на сайті',
                        Date: clean(getTxt('.event-info__item--date, [class*=""date""]')),
                        City: clean(getTxt('.event-info__item--place, [class*=""location""]')),
                        Category: category,
                        ImageUrl: imageUrl
                    };
                }");

                string rawDate = details.GetProperty("Date").GetString() ?? string.Empty;

                string rawCategory = details.GetProperty("Category").GetString()?.ToLower() ?? "інше";
                string mappedCategory = rawCategory switch
                {
                    var c when c.Contains("театр") || c.Contains("комедія") || c.Contains("вистава") => "theatres",
                    var c when c.Contains("концерт") || c.Contains("поп") || c.Contains("рок") ||
                               c.Contains("музика") => "concerts",
                    var c when c.Contains("стендап") || c.Contains("stand-up") || c.Contains("гумор") => "stand-up",
                    var c when c.Contains("дітям") || c.Contains("дитяч") => "child",
                    var c when c.Contains("фестиваль") => "festivals",
                    _ => "inshe"
                };

                var newEvent = new ScrapedEvent
                {
                    Title = item.Title,
                    Url = item.Url,
                    Source = ProviderName,
                    Description = details.GetProperty("Description").GetString() ?? "Опис відсутній",
                    Date = rawDate,
                    ParsedDate = DateParser.ParseUkrainianDate(rawDate),
                    City = item.CitySlug.ToUpper(),
                    CityUk = CityTranslations.GetValueOrDefault(item.CitySlug.ToLower(), item.CitySlug),
                    Category = mappedCategory,
                    ImageUrl = details.GetProperty("ImageUrl").GetString() ?? ""
                };

                newEvent.GenerateDeterministicId();
                
                lock (allCollectedEvents)
                {
                    allCollectedEvents.Add(newEvent);
                }

                _logger.LogInformation("✅ Concert.ua: {Title} -> {Category}", newEvent.Title, newEvent.Category);
                await Task.Delay(Random.Shared.Next(300, 700));
            }
            catch (Exception ex)
            {
                _logger.LogWarning("⚠️ Пропущено {Url}: {Msg}", item.Url, ex.Message);
            }
            finally
            {
                _semaphore.Release();
            }
        });

        await Task.WhenAll(tasks);
        return allCollectedEvents;
    }
}