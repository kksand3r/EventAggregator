namespace EventAggregator.Application.Parsing;

public static class DateParser
{
    private static readonly Dictionary<string, int> Months = new()
    {
        { "січ", 1 }, { "лют", 2 }, { "бер", 3 }, { "кві", 4 }, { "тра", 5 }, { "чер", 6 },
        { "лип", 7 }, { "сер", 8 }, { "вер", 9 }, { "жов", 10 }, { "лис", 11 }, { "гру", 12 }
    };

    public static DateTime? ParseUkrainianDate(string dateRaw)
    {
        if (string.IsNullOrWhiteSpace(dateRaw)) return null;

        try
        {
            var input = dateRaw.ToLower();

            var dateMatch = System.Text.RegularExpressions.Regex.Match(input, @"(\d{1,2})");
            var timeMatch = System.Text.RegularExpressions.Regex.Match(input, @"(\d{2}:\d{2})");

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

            int hour = 19;
            int minute = 0;

            if (timeMatch.Success)
            {
                var timeParts = timeMatch.Groups[1].Value.Split(':');
                hour = int.Parse(timeParts[0]);
                minute = int.Parse(timeParts[1]);
            }

            return new DateTime(year, month, day, hour, minute, 0);
        }
        catch
        {
            return null;
        }
    }
}