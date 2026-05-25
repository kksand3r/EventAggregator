using System.Text;
using Elastic.Clients.Elasticsearch;
using Elastic.Clients.Elasticsearch.QueryDsl;
using EventAggregator.Domain.Interfaces;
using EventAggregator.Domain.Models;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.WebUtilities;

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

        _logger.LogInformation("🛠️ Створення індексу '{Index}' в Elasticsearch...", IndexName);

        await _client.Indices.CreateAsync(IndexName, c => c
            .Mappings(m => m
                .Properties<ScrapedEvent>(p => p
                    .Keyword(k => k.Category)
                    .Keyword(k => k.City)
                    .Text(t => t.Title)
                    .Text(t => t.Description)
                )
            ), ct);
    }

    public async Task SaveEventsAsync(IEnumerable<ScrapedEvent> events, CancellationToken ct)
    {
        var eventsList = events.ToList();
        if (!eventsList.Any()) return;

        var response = await _client.BulkAsync(b => b
            .Index(IndexName)
            .IndexMany(eventsList, (descriptor, sEvent) =>
                descriptor.Id(WebEncoders.Base64UrlEncode(
                    Encoding.UTF8.GetBytes($"{sEvent.Title}_{sEvent.City}_{sEvent.Date}")))
            ), ct);

        if (response.IsValidResponse)
            _logger.LogInformation("✅ Успішно збережено {Count} подій.", eventsList.Count);
        else
            _logger.LogError("❌ Помилка Elasticsearch: {Error}", response.DebugInformation);
    }

    public async Task<IEnumerable<ScrapedEvent>> SearchEventsAsync(string? query, string? city, int size = 10, CancellationToken ct = default)
    {
        var mustQueries = new List<Query>();

        if (!string.IsNullOrWhiteSpace(query))
        {
            mustQueries.Add(new MultiMatchQuery
            {
                Query = query,
                Fields = new[] { "title^3", "description" },
                Fuzziness = new Fuzziness("AUTO")
            });
        }

        if (!string.IsNullOrWhiteSpace(city))
        {
            mustQueries.Add(new MatchQuery(new Field("city"))
            {
                Query = city
            });
        }

        // Якщо жодного фільтра не вказано, отримуємо всі події
        var searchDescriptor = new SearchRequestDescriptor<ScrapedEvent>()
            .Index(IndexName)
            .Size(size);

        if (mustQueries.Any())
        {
            searchDescriptor.Query(q => q.Bool(b => b.Must(mustQueries)));
        }

        var response = await _client.SearchAsync<ScrapedEvent>(searchDescriptor, ct);

        if (!response.IsValidResponse)
        {
            _logger.LogError("❌ Помилка пошуку Elasticsearch: {Error}", response.DebugInformation);
            return Enumerable.Empty<ScrapedEvent>();
        }

        return response.Documents;
    }
}