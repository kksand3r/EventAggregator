using System.Text.RegularExpressions;

namespace EventAggregator.Domain.Models;

public sealed class EventEqualityComparer : IEqualityComparer<ScrapedEvent>
{
    public static readonly EventEqualityComparer Instance = new();

    private static readonly Dictionary<string, int> Months = new()
    {
        { "січ", 1 }, { "лют", 2 }, { "бер", 3 }, { "кві", 4 }, { "тра", 5 }, { "чер", 6 },
        { "лип", 7 }, { "сер", 8 }, { "вер", 9 }, { "жов", 10 }, { "лис", 11 }, { "гру", 12 }
    };

    public bool Equals(ScrapedEvent? x, ScrapedEvent? y)
    {
        if (ReferenceEquals(x, y)) return true;
        if (x is null || y is null) return false;

        if (!string.Equals(x.City, y.City, StringComparison.OrdinalIgnoreCase)) return false;

        if (!string.Equals(NormalizeTitle(x.Title), NormalizeTitle(y.Title), StringComparison.OrdinalIgnoreCase))
            return false;

        var dateX = ParseDateLocal(x.Date);
        var dateY = ParseDateLocal(y.Date);

        if (dateX.HasValue && dateY.HasValue)
        {
            return dateX.Value.Date == dateY.Value.Date;
        }

        return string.Equals(NormalizeTitle(x.Date), NormalizeTitle(y.Date), StringComparison.OrdinalIgnoreCase);
    }

    public int GetHashCode(ScrapedEvent obj)
    {
        var comparer = StringComparer.OrdinalIgnoreCase;

        var titleHash = obj.Title != null ? comparer.GetHashCode(NormalizeTitle(obj.Title)) : 0;
        var cityHash = obj.City != null ? comparer.GetHashCode(obj.City) : 0;

        var parsedDate = ParseDateLocal(obj.Date);
        var dateHash = parsedDate.HasValue
            ? parsedDate.Value.Date.GetHashCode()
            : (obj.Date != null ? comparer.GetHashCode(NormalizeTitle(obj.Date)) : 0);

        return HashCode.Combine(titleHash, cityHash, dateHash);
    }

    private static string NormalizeTitle(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;

        return input
            .Replace(" ", "")
            .Replace("-", "")
            .Replace("/", "")
            .Replace("|", "")
            .Replace("(", "")
            .Replace(")", "")
            .ToLowerInvariant();
    }

    private static DateTime? ParseDateLocal(string? dateRaw)
    {
        if (string.IsNullOrWhiteSpace(dateRaw)) return null;

        try
        {
            var input = dateRaw.ToLower();

            var dateMatch = Regex.Match(input, @"(\d{1,2})");
            if (!dateMatch.Success) return null;

            int day = int.Parse(dateMatch.Groups[1].Value);
            int month = DateTime.Now.Month;
            int year = DateTime.Now.Year;

            foreach (var m in Months)
            {
                if (input.Contains(m.Key))
                {
                    month = m.Value;
                    break;
                }
            }

            if (month < DateTime.Now.Month) year++;

            return new DateTime(year, month, day, 0, 0, 0);
        }
        catch
        {
            return null;
        }
    }
}