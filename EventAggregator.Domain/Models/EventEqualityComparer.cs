namespace EventAggregator.Domain.Models;

public sealed class EventEqualityComparer : IEqualityComparer<ScrapedEvent>
{
    public static readonly EventEqualityComparer Instance = new();
    
    public bool Equals(ScrapedEvent? x, ScrapedEvent? y)
    {
        if (ReferenceEquals(x, y)) return true;
        if (x is null || y is null) return false;
        
        return string.Equals(x.City, y.City, StringComparison.OrdinalIgnoreCase) &&
               string.Equals(x.Date, y.Date, StringComparison.OrdinalIgnoreCase) &&
               string.Equals(x.Title, y.Title, StringComparison.OrdinalIgnoreCase);
    }
    
    public int GetHashCode(ScrapedEvent obj)
    {
        var titleHash = obj.Title?.ToLowerInvariant().GetHashCode() ?? 0;
        var cityHash = obj.City?.ToLowerInvariant().GetHashCode() ?? 0;
        var dateHash = obj.Date?.ToLowerInvariant().GetHashCode() ?? 0;
    
        return HashCode.Combine(titleHash, cityHash, dateHash);
    }
}