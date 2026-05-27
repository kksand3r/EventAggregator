using System.Text;
using Elastic.Clients.Elasticsearch;
using Elastic.Clients.Elasticsearch.QueryDsl;
using EventAggregator.Domain.Interfaces;
using EventAggregator.Domain.Models;
using Microsoft.Extensions.Logging;

namespace EventAggregator.Infrastructure.Repository;

public class ElasticEventRepository : IEventRepository
{
    private readonly ElasticsearchClient _client;
    private readonly ILogger<ElasticEventRepository> _logger;
    private const string IndexName = "events";

    public ElasticEventRepository(ElasticsearchClient client, ILogger<ElasticEventRepository> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task EnsureIndexCreatedAsync(CancellationToken ct)
    {
        var exists = await _client.Indices.ExistsAsync(IndexName, ct);
        if (exists.Exists) return;

        _logger.LogInformation("🛠️ Створення індексу '{Index}' в Elasticsearch з повною схемою полів...", IndexName);

        var createResponse = await _client.Indices.CreateAsync(IndexName, c => c
            .Mappings(m => m
                .Properties<ScrapedEvent>(p => p
                    // 🌟 Основні текстові поля з українським аналізатором
                    .Text(t => t.Title, g => g.Analyzer("ukrainian"))
                    .Text(t => t.Description, g => g.Analyzer("ukrainian"))
                    .Text(t => t.CityUk, g => g.Analyzer("ukrainian"))
                    .Text(t => t.Category, g => g
                        .Analyzer("ukrainian")
                        .Fields(f => f.Keyword("keyword"))
                    )
                    
                    // 🌟 Наше критичне поле дати для правильної фільтрації та сортування
                    .Date(d => d.ParsedDate) 
                    
                    // 🌟 Keyword поля для системних даних та фільтрів
                    .Keyword(k => k.City)
                    .Keyword(k => k.Source)
                    
                    // 🌟 Текстові допоміжні поля
                    .Text(t => t.Url)
                    .Text(t => t.ImageUrl)
                    .Text(t => t.Date)
                )
            ), ct);

        if (!createResponse.IsValidResponse)
        {
            _logger.LogError("❌ НЕ ВДАЛОСЯ створити індекс! Помилка: {Error}", createResponse.DebugInformation);
            throw new Exception($"Помилка ініціалізації мапінгу Elastic: {createResponse.ElasticsearchServerError?.Error.Reason}");
        }

        _logger.LogInformation("✅ Індекс '{Index}' успішно створено з повним мапінгом полів.", IndexName);
    }

    public async Task SaveEventsAsync(IEnumerable<ScrapedEvent> events, CancellationToken ct)
    {
        var eventsList = events.ToList();
        if (!eventsList.Any()) return;

        var response = await _client.BulkAsync(b => b
                .Index(IndexName)
                .IndexMany(eventsList, (descriptor, sEvent) => descriptor.Id(sEvent.Id)) 
            , ct);

        if (response.IsValidResponse)
            _logger.LogInformation("✅ Успішно збережено {Count} подій.", eventsList.Count);
        else
            _logger.LogError("❌ Помилка Elasticsearch: {Error}", response.DebugInformation);
    }
}