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
    
    private readonly SemaphoreSlim _semaphore = new(2); 

    private readonly string[] _citySlugs = 
    {
        "kyiv", "odesa", "dnipro", "lviv", "kharkiv", "ivano-frankivsk",
        "vinnytsia", "poltava", "zhytomyr", "zaporizhzhia", "ternopil",
        "chernivtsi", "chernihiv", "sumy", "khmelnytskyi", "rivne",
        "lutsk", "mykolaiv", "uzhhorod", "kropyvnytskyi"
    };
    
    private readonly string[] _categories = { "concerts", "theatres", "stand-up", "child", "clubs", "inshe", "festivals" };

    public KarabasScraper(ILogger<KarabasScraper> logger) => _logger = logger;

    public async Task<List<ScrapedEvent>> ScrapeAsync(IBrowser browser)
    {
        var allEvents = new List<ScrapedEvent>();
        if (browser.IsClosed) return allEvents;

        var linksToScrape = new List<(string Title, string Url, string City, string Category)>();
        
        foreach (var city in _citySlugs)
        {
            _logger.LogInformation("🏙️ Karabas.com: Пошук у місті: {City}", city.ToUpper());

            foreach (var category in _categories)
            {
                if (browser.IsClosed) break;

                string targetUrl = $"https://{city}.karabas.com/ua/{category}/";
                IPage mainPage = null; 

                try
                {
                    mainPage = await browser.NewPageAsync();
                    mainPage.DefaultNavigationTimeout = 60000;
                    mainPage.DefaultTimeout = 60000;
                    await mainPage.SetViewportAsync(new ViewPortOptions { Width = 1920, Height = 1080 });
                    await mainPage.SetUserAgentAsync("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");

                    await mainPage.GoToAsync(targetUrl, new NavigationOptions 
                    { 
                        WaitUntil = new[] { WaitUntilNavigation.DOMContentLoaded }, 
                        Timeout = 60000 
                    });
                    
                    await AutoScrollAsync(mainPage);

                    var data = await mainPage.EvaluateFunctionAsync<JsonElement[]>(@"() => {
                        return Array.from(document.querySelectorAll('.event-item, .result-event'))
                            .map(ev => ({
                                title: ev.querySelector('.event-title, .title-row a')?.innerText?.trim() || '',
                                url: ev.querySelector('a.main-url, .title-row a')?.href || ''
                            })).filter(e => e.title && e.url);
                    }");

                    if (data != null)
                    {
                        foreach (var d in data)
                        {
                            var url = d.GetProperty("url").GetString() ?? "";
                            var title = d.GetProperty("title").GetString() ?? "Без назви";
                            if (!linksToScrape.Any(x => x.Url == url))
                                linksToScrape.Add((title, url, city.ToUpper(), category));
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("⚠️ Пропущено список {Url}: {Msg}", targetUrl, ex.Message);
                }
                finally
                {
                    if (mainPage != null && !mainPage.IsClosed)
                    {
                        await mainPage.CloseAsync();
                    }
                }
            }
        }

        _logger.LogInformation("🚀 Karabas: Глибокий збір деталей для {Count} подій...", linksToScrape.Count);

        var tasks = linksToScrape.Select(async item =>
        {
            await _semaphore.WaitAsync();
            IPage page = null;
            try
            {
                if (browser.IsClosed) return;

                page = await browser.NewPageAsync();
                page.DefaultNavigationTimeout = 60000;
                page.DefaultTimeout = 60000;

                await page.GoToAsync(item.Url, new NavigationOptions 
                { 
                    WaitUntil = new[] { WaitUntilNavigation.DOMContentLoaded }, 
                    Timeout = 60000 
                });

                var details = await page.EvaluateFunctionAsync<JsonElement>(@"() => {
                    const clean = (str) => (!str ? '' : str.replace(/ПОКАЗАТИ ЩЕ/g, '').replace(/\s+/g, ' ').trim());
                    const getTxt = (sel) => document.querySelector(sel)?.innerText || '';
                    
                    return {
                        Description: clean(getTxt('.event-description, .about-event__text, #event-description')),
                        Date: clean(getTxt('.date-time-location, .date-time, .event-date')),
                        ImageUrl: document.querySelector('.event-poster img')?.src || ''
                    };
                }");

                var rawDate = details.TryGetProperty("Date", out var dateEl) ? dateEl.GetString() : "";
                
                var newEvent = new ScrapedEvent
                {
                    Title = item.Title,
                    Url = item.Url,
                    Source = ProviderName,
                    Description = details.TryGetProperty("Description", out var descEl) ? descEl.GetString() : "",
                    Date = rawDate ?? "",
                    ParsedDate = DateParser.ParseUkrainianDate(rawDate ?? ""), 
                    City = item.City.ToUpper(),
                    Category = item.Category,
                    ImageUrl = details.TryGetProperty("ImageUrl", out var imgEl) ? imgEl.GetString() : "" 
                };

                lock (allEvents) { allEvents.Add(newEvent); }
                _logger.LogInformation("✅ Karabas: {Title} [{City}]", newEvent.Title, newEvent.City);
                
                await Task.Delay(Random.Shared.Next(1000, 2000));
            }
            catch (Exception ex)
            {
                _logger.LogWarning("⚠️ Помилка завантаження деталей {Url}: {Msg}", item.Url, ex.Message);
            }
            finally 
            { 
                if (page != null && !page.IsClosed) await page.CloseAsync();
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
            await page.EvaluateFunctionAsync(@"async () => { window.scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 1500)); }"); 
        } 
        catch { }
    }
}