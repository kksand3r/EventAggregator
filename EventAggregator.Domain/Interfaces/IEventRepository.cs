using EventAggregator.Domain.Models;

namespace EventAggregator.Domain.Interfaces;

public interface IEventRepository
{
    Task SaveEventsAsync(IEnumerable<ScrapedEvent> events, CancellationToken ct);
    
    Task EnsureIndexCreatedAsync(CancellationToken ct);
    
    Task<IEnumerable<ScrapedEvent>> SearchEventsAsync(string? query, string? city, int size = 10, CancellationToken ct = default);
}