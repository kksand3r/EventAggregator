namespace EventAggregator.Domain.Models;

public class ScrapedEvent
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Title { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Date { get; set; } = string.Empty;
    public DateTime? ParsedDate { get; set; }
    public string City { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public long ViewsCount { get; set; } = 0;
    public string ImageUrl { get; set; } = string.Empty;
}