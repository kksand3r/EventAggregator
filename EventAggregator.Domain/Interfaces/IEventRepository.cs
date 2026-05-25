using EventAggregator.Domain.Models;

namespace EventAggregator.Domain.Interfaces;

public interface IEventRepository
{
    Task SaveEventsAsync(IEnumerable<ScrapedEvent> events, CancellationToken ct);
    
    Task<IEnumerable<ScrapedEvent>> SearchEventsAsync(string? query, string? city, int size, CancellationToken ct);
}