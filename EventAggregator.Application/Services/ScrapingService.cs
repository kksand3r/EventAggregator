using EventAggregator.Application.Interfaces;
using EventAggregator.Domain.Interfaces;
using EventAggregator.Domain.Models;
using Microsoft.Extensions.Logging;
using PuppeteerSharp;

namespace EventAggregator.Application.Services
{
    public class ScrapingService
    {
        private readonly IEnumerable<IEventScraper> _scrapers;
        private readonly IEventRepository _repository;
        private readonly ILogger<ScrapingService> _logger;

        public ScrapingService(
            IEnumerable<IEventScraper> scrapers, 
            IEventRepository repository,
            ILogger<ScrapingService> logger)
        {
            _scrapers = scrapers;
            _repository = repository;
            _logger = logger;
        }

        public async Task ProcessAllSourcesAsync(IBrowser browser, CancellationToken ct)
        {
            // ✅ Створюємо індекс з правильним маппінгом до запису даних

            var allEvents = new List<ScrapedEvent>();

            foreach (var scraper in _scrapers)
            {
                if (ct.IsCancellationRequested) break;
                try
                {
                    var results = await scraper.ScrapeAsync(browser);
                    allEvents.AddRange(results);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Помилка скрапера {Provider}", scraper.ProviderName);
                }
            }
            
            var uniqueEvents = allEvents.Distinct(EventEqualityComparer.Instance).ToList();
        
            _logger.LogInformation("Зібрано: {Total}. Після очистки: {Unique}", allEvents.Count, uniqueEvents.Count);
            
            await _repository.SaveEventsAsync(uniqueEvents, ct);
        }
    }
}