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
            await _repository.EnsureIndexCreatedAsync(ct);

            var allEvents = new List<ScrapedEvent>();
            var random = new Random();
            var scrapersList = _scrapers.ToList();

            for (int i = 0; i < scrapersList.Count; i++)
            {
                if (ct.IsCancellationRequested) break;

                var scraper = scrapersList[i];
                try
                {
                    _logger.LogInformation("⏳ Запуск скрапінгу для провайдера: {Provider}", scraper.ProviderName);

                    var results = await scraper.ScrapeAsync(browser);
                    allEvents.AddRange(results);

                    _logger.LogInformation("✨ Провайдер {Provider} успішно зібрав {Count} подій.", scraper.ProviderName,
                        results.Count);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Помилка скрапера {Provider}", scraper.ProviderName);
                }

                if (i < scrapersList.Count - 1 && !ct.IsCancellationRequested)
                {
                    int delay = random.Next(5000, 12000);
                    _logger.LogInformation(
                        "😴 Очікування {Delay} мс перед переходом до наступного сайту, щоб уникнути блокування по IP...",
                        delay);

                    try
                    {
                        await Task.Delay(delay, ct);
                    }
                    catch (TaskCanceledException)
                    {
                        _logger.LogWarning("⏱️ Очікування було перервано через скасування операції.");
                        break;
                    }
                }
            }

            var uniqueEvents = allEvents.Distinct(EventEqualityComparer.Instance).ToList();

            _logger.LogInformation("📊 Підсумок сесії — Зібрано всього: {Total}. Унікальних після очистки: {Unique}",
                allEvents.Count, uniqueEvents.Count);

            await _repository.SaveEventsAsync(uniqueEvents, ct);
        }
    }
}