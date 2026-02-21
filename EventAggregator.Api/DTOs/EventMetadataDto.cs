namespace EventAggregator.Api.DTOs;

public class EventMetadataDto
{
    public List<string> Cities { get; set; } = new();
    public List<string> Categories { get; set; } = new();
}