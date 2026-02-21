using EventAggregator.Domain.Models;

namespace EventAggregator.Domain.Interfaces;

public interface IEventRepository
{
    Task SaveEventsAsync(IEnumerable<ScrapedEvent> events, CancellationToken ct);
}