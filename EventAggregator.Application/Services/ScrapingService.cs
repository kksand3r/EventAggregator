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
        private readonly GeminiService _geminiService;
        private readonly ILogger<ScrapingService> _logger;

        public ScrapingService(
            IEnumerable<IEventScraper> scrapers, 
            IEventRepository repository,
            GeminiService geminiService, 
            ILogger<ScrapingService> logger)
        {
            _scrapers = scrapers;
            _repository = repository;
            _geminiService = geminiService;
            _logger = logger;
        }

        public async Task ProcessAllSourcesAsync(IBrowser browser, CancellationToken ct)
        {
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
            
            _logger.LogInformation("⏳ Починаємо генерацію векторів (Embeddings) для подій...");
            
            foreach (var evt in uniqueEvents)
            {
                if (ct.IsCancellationRequested) break;

                var textToEmbed = $"{evt.Title}. Категорія: {evt.Category}. Місто: {evt.City}. Опис: {evt.Description}";
                
                if (textToEmbed.Length > 2000) 
                {
                    textToEmbed = textToEmbed.Substring(0, 2000);
                }

                evt.Embedding = await _geminiService.GenerateEmbeddingAsync(textToEmbed);

                await Task.Delay(500, ct); 
            }
            
            _logger.LogInformation("✅ Генерацію векторів завершено.");
            
            await _repository.SaveEventsAsync(uniqueEvents, ct);
        }
    }
}