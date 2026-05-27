using Elastic.Clients.Elasticsearch;
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

        _logger.LogInformation("🛠️ Створення індексу '{Index}' в Elasticsearch з українською морфологією...", IndexName);

        var response = await _client.Indices.CreateAsync(IndexName, c => c
            .Mappings(m => m
                .Properties<ScrapedEvent>(p => p
                    // 📝 1. Поля для повнотекстового пошуку (розумний пошук з відмінками)
                    .Text(t => t.Title, g => g.Analyzer("ukrainian")) 
                    .Text(t => t.Description, g => g.Analyzer("ukrainian")) 
                    .Text(t => t.CityUk, g => g.Analyzer("ukrainian"))
                    .Text(t => t.Category, g => g
                            .Analyzer("ukrainian")
                            .Fields(f => f.Keyword("keyword")) // Підполе для точної фільтрації (category.keyword)
                    )

                    // 🔍 2. Поля для точного збігу / фільтрації (без розбиття на слова)
                    .Keyword(k => k.City)
                    .Keyword(k => k.Source)
                    .Keyword(k => k.Url)
                    .Keyword(k => k.ImageUrl)
                    .Keyword(k => k.Id)

                    // 📅 3. Дати та числа (для правильного сортування і діапазонів)
                    .Date(d => d.ParsedDate)
                    .Number(n => n.ViewsCount, n => n.Type(NumberType.Long))
                )
            ), ct);

        if (response.IsValidResponse)
        {
            _logger.LogInformation("🚀 Індекс '{Index}' успішно створено з правильними мапінгами.", IndexName);
        }
        else
        {
            _logger.LogError("❌ Не вдалося створити індекс Elasticsearch: {Error}", response.DebugInformation);
        }
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
            _logger.LogError("❌ Помилка Elasticsearch під час виконання Bulk-запиту: {Error}", response.DebugInformation);
    }
}