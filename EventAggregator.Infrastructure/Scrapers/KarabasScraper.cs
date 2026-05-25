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

public class KarabasScraper : IEventScraper
{
    public string ProviderName => "Karabas.com";
    private readonly ILogger<KarabasScraper> _logger;
    
    private readonly SemaphoreSlim _semaphore = new(2); 

    private readonly string[] _citySlugs = 
    {
        "mykolaiv", "uzhhorod", "kropyvnytskyi", "lutsk", // "kharkiv", "ivano-frankivsk",
        //"vinnytsia", "poltava", "zhytomyr", "zaporizhzhia", "ternopil",
        //"chernivtsi", "chernihiv", "sumy", "khmelnytskyi", "rivne",
        //"lutsk", "mykolaiv", "uzhhorod", "kropyvnytskyi"
    };
    
    private readonly string[] _categories = { "concerts", "theatres", "stand-up", "child", "clubs", "inshe", "festivals" };

    public KarabasScraper(ILogger<KarabasScraper> logger) => _logger = logger;

    public async Task<List<ScrapedEvent>> ScrapeAsync(IBrowser browser)
    {
        var allEvents = new List<ScrapedEvent>();
        if (browser.IsClosed) return allEvents;

        var linksToScrape = new List<(string Title, string Url, string City, string Category)>();
        
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
                _logger.LogInformation("🏙️ Karabas.com: Пошук у місті: {City} (через API)", city.ToUpper());

                foreach (var category in _categories)
                {
                    int page = 1;
                    bool hasMorePages = true;

                    while (hasMorePages)
                    {
                        if (browser.IsClosed) return allEvents; 

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
                                
                                var regex = new Regex(@"<div[^>]*class\s*=\s*""[^""]*title-row[^""]*""[^>]*>\s*<a\s+href\s*=\s*""([^""]+)""[^>]*>([\s\S]*?)</a>", RegexOptions.IgnoreCase);
                                var matches = regex.Matches(htmlContent);

                                foreach (Match m in matches)
                                {
                                    var url = m.Groups[1].Value.Trim().Replace("\\/", "/");
                                    var title = Regex.Replace(m.Groups[2].Value, "<.*?>", string.Empty).Trim().Replace("\n", " ");
                                    
                                    if (url.StartsWith("/")) url = "https://karabas.com" + url;

                                    if (!linksToScrape.Any(x => x.Url == url))
                                    {
                                        linksToScrape.Add((title, url, city.ToUpper(), category));
                                    }
                                }
                                
                                if (matches.Count > 0)
                                {
                                    _logger.LogInformation("   Отримано {Count} подій з {Category} (Сторінка {Page})", matches.Count, category, page);
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
                                    await Task.Delay(Random.Shared.Next(800, 1500)); 
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning("⚠️ Помилка збору {Url}: {Msg}", targetUrl, ex.Message);
                            hasMorePages = false;
                        }
                    }
                    
                    
                    await Task.Delay(Random.Shared.Next(1000, 2000));
                }
            }
        }

        _logger.LogInformation("🚀 Karabas: Глибокий збір деталей для {Count} подій через Puppeteer...", linksToScrape.Count);
        
        var tasks = linksToScrape.Select(async item =>
        {
            await _semaphore.WaitAsync();
            IPage page = null;
            
            await Task.Delay(Random.Shared.Next(500, 1500)); 

            int maxRetries = 3; 
            
            for (int attempt = 1; attempt <= maxRetries; attempt++)
            {
                try
                {
                    if (browser.IsClosed) return;

                    page = await browser.NewPageAsync();
                    page.DefaultNavigationTimeout = 60000;
                    page.DefaultTimeout = 60000;

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
                        Date = rawDate,
                        ParsedDate = DateParser.ParseUkrainianDate(rawDate), 
                        City = item.City.ToUpper(),
                        Category = item.Category,
                        ImageUrl = details.GetProperty("ImageUrl").GetString() ?? "" 
                    };

                    lock (allEvents) { allEvents.Add(newEvent); }
                    _logger.LogInformation("✅ Karabas: {Title} [{City}]", newEvent.Title, newEvent.City);
                    
                    break; 
                    
                }
                catch (PuppeteerException ex) when (ex.Message.Contains("Timeout") || ex.Message.Contains("exceeded"))
                {
                    _logger.LogWarning("⏳ Таймаут {Url} (Спроба {Attempt}/{Max})", item.Url, attempt, maxRetries);
                    if (attempt < maxRetries) await Task.Delay(2000 * attempt);
                }
                catch (Exception ex)
                {
                    if (attempt == maxRetries)
                        _logger.LogWarning("❌ Всі {Max} спроби провалилися для {Url}: {Msg}", maxRetries, item.Url, ex.Message);
                    else
                        await Task.Delay(2000 * attempt);
                }
                finally 
                { 
                    if (page != null && !page.IsClosed) await page.CloseAsync();
                }
            }
            
            _semaphore.Release(); 
        });

        await Task.WhenAll(tasks);
        return allEvents;
    }
}