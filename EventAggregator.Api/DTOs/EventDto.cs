using EventAggregator.Domain.Models;

namespace EventAggregator.Api.DTOs
{
    public class EventDto
    {
        public string Id { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        public string Date { get; set; } = string.Empty;
        public string City { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Source { get; set; } = string.Empty;
        public long ViewsCount { get; set; }
        public string ImageUrl { get; set; } = string.Empty;
    }

    public static class EventMapper
    {
        public static EventDto ToDto(this ScrapedEvent e)
        {
            return new EventDto
            {
                Id = e.Id,
                Title = e.Title,
                Url = e.Url,
                Date = e.ParsedDate?.ToString("dd.MM.yyyy HH:mm") ?? e.Date,
                City = e.City,
                Description = e.Description,
                Category = e.Category,
                Source = e.Source,
                ViewsCount = e.ViewsCount,
                ImageUrl = e.ImageUrl
            };
        }
    }
}