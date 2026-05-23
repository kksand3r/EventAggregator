using System.Text.Json;
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

    private readonly SemaphoreSlim _semaphore = new(4);

    private readonly string[] _citySlugs =
    {
        "kyiv", "odesa", "dnipro", "lviv", "kharkiv", "ivano-frankivsk",
        "vinnytsia", "poltava", "zhytomyr", "zaporizhzhia", "ternopil",
        "chernivtsi", "chernihiv", "sumy", "khmelnytskyi", "rivne",
        "lutsk", "mykolaiv", "uzhhorod", "kropyvnytskyi"
    };

    private readonly string[] _categories =
        { "concerts", "theatres", "stand-up", "child", "clubs", "inshe", "festivals" };

    public KarabasScraper(ILogger<KarabasScraper> logger) => _logger = logger;

    public async Task<List<ScrapedEvent>> ScrapeAsync(IBrowser browser)
    {
        var allEvents = new List<ScrapedEvent>();
        if (browser.IsClosed) return allEvents;

        using var mainPage = await browser.NewPageAsync();
        mainPage.DefaultNavigationTimeout = 60000;
        await mainPage.SetViewportAsync(new ViewPortOptions { Width = 1920, Height = 1080 });
        await mainPage.SetUserAgentAsync(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

        var linksToScrape = new List<(string Title, string Url, string City, string Category)>();

        foreach (var city in _citySlugs)
        {
            _logger.LogInformation("🏙️ Karabas.com: Пошук у місті: {City}", city.ToUpper());

            foreach (var category in _categories)
            {
                string targetUrl = $"https://{city}.karabas.com/uk/{category}/";
                try
                {
                    await mainPage.GoToAsync(targetUrl, new NavigationOptions
                    {
                        WaitUntil = new[] { WaitUntilNavigation.Networkidle2 },
                        Timeout = 60000
                    });

                    await AutoScrollAsync(mainPage);
                    await Task.Delay(2000);
                    
                    var data = await mainPage.EvaluateFunctionAsync<JsonElement[]>(@"() => {
                        return Array.from(document.querySelectorAll('.result-event.disp_row'))
                            .map(ev => ({
                                title: ev.querySelector('.inf.disp_col .title-row a')?.innerText?.trim() || '',
                                url: ev.querySelector('.inf.disp_col .title-row a')?.href || ''
                            })).filter(e => e.title && e.url);
                    }");

                    foreach (var d in data)
                    {
                        var url = d.GetProperty("url").GetString() ?? "";
                        if (!linksToScrape.Any(x => x.Url == url))
                            linksToScrape.Add((d.GetProperty("title").GetString() ?? "Без назви", url, city.ToUpper(),
                                category));
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("⚠️ Пропущено список {Url}: {Msg}", targetUrl, ex.Message);
                }
            }
        }

        _logger.LogInformation("🚀 Karabas: Глибокий збір деталей для {Count} подій...", linksToScrape.Count);

        var tasks = linksToScrape.Select(async item =>
        {
            await _semaphore.WaitAsync();
            try
            {
                if (browser.IsClosed) return;

                using var page = await browser.NewPageAsync();
                page.DefaultNavigationTimeout = 60000;

                await page.GoToAsync(item.Url, new NavigationOptions
                {
                    WaitUntil = new[] { WaitUntilNavigation.Load },
                    Timeout = 60000
                });

                var details = await page.EvaluateFunctionAsync<JsonElement>(@"() => {
                    const clean = (str) => {
                        if (!str) return '';
                        if (str.includes('Опис на сайті') || str.includes('Опис відсутній')) return '';
                        return str.replace(/ПОКАЗАТИ ЩЕ/g, '').replace(/\s+/g, ' ').trim();
                    };

                    const dateSelectors = [
                        '.date-time-location .date-time span', 
                        '.date-time span',                     
                        '.event-date', 
                        '.ev-date', 
                        '.data-time'
                    ];

                    let rawDate = '';
                    for (let selector of dateSelectors) {
                        const el = document.querySelector(selector);
                        if (el && el.innerText.trim()) {
                            rawDate = el.innerText;
                            break; 
                        }
                    }

                    if (!rawDate) {
                        const container = document.querySelector('.date-time-location, .date-time');
                        if (container) {
                            rawDate = container.innerText.replace(/^.*?,/, '');
                        }
                    }

                    const posterContainer = document.querySelector('.event-poster');
                    let imgUrl = '';
                    if (posterContainer) {
                        const source = posterContainer.querySelector('source');
                        const img = posterContainer.querySelector('img');
                        
                        if (source && source.srcset) {
                            imgUrl = source.srcset.split(',')[0].trim().split(' ')[0];
                        } else if (img) {
                            imgUrl = img.src;
                        }
                    }

                    return {
                        Description: clean(document.querySelector('.event-description, .about-event__text, #event-description')?.innerText),
                        Date: clean(rawDate),
                        ImageUrl: imgUrl
                    };
                }");

                string rawDate = details.GetProperty("Date").GetString() ?? string.Empty;

                var newEvent = new ScrapedEvent
                {
                    Title = item.Title,
                    Url = item.Url,
                    Source = ProviderName,
                    Description = details.GetProperty("Description").GetString() ?? "",
                    Date = details.GetProperty("Date").GetString() ?? "",
                    ParsedDate = DateParser.ParseUkrainianDate(rawDate),
                    City = item.City.ToUpper(),
                    Category = item.Category,
                    ImageUrl = details.GetProperty("ImageUrl").GetString() ?? ""
                };

                lock (allEvents)
                {
                    allEvents.Add(newEvent);
                }

                _logger.LogInformation("✅ Karabas: {Title}", newEvent.Title);

                await Task.Delay(Random.Shared.Next(500, 1000));
            }
            catch (Exception ex)
            {
                _logger.LogWarning("⚠️ Помилка завантаження {Url}: {Msg}", item.Url, ex.Message);
            }
            finally
            {
                _semaphore.Release();
            }
        });

        await Task.WhenAll(tasks);
        return allEvents;
    }

    private static async Task AutoScrollAsync(IPage page)
    {
        try
        {
            await page.EvaluateFunctionAsync(@"async () => {
                for (let i = 0; i < 10; i++) {
                    const btn = document.querySelector('.show-more.red-hover');
                    if (!btn) break;
                    btn.click();
                    await new Promise(r => setTimeout(r, 3000));
                }
                window.scrollTo(0, document.body.scrollHeight);
            }");
        }
        catch { }
    }
}