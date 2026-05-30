using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace EventAggregator.Application.Parsing;

public static class DateParser
{
    private static readonly Dictionary<string, int> Months = new(StringComparer.OrdinalIgnoreCase)
    {
        {"січ", 1}, {"лют", 2}, {"бер", 3}, {"кві", 4}, {"тра", 5}, {"чер", 6},
        {"лип", 7}, {"сер", 8}, {"вер", 9}, {"жов", 10}, {"лис", 11}, {"гру", 12}
    };

    private static readonly string[] DaysOfWeek = 
    { 
        "пон", "вів", "сер", "чет", "п'я", "пт", "суб", "сб", "нед", "нд" 
    };

    public static DateTime? ParseUkrainianDate(string? dateRaw)
    {
        if (string.IsNullOrWhiteSpace(dateRaw)) return null;

        // 1. Спроба розпарсити стандартний ISO або системний формат
        if (DateTimeOffset.TryParse(dateRaw, out var parsedOffset)) return parsedOffset.DateTime;
        if (DateTime.TryParse(dateRaw, out var parsedNet)) return parsedNet;

        // 2. Інтелектуальний розбір українського тексту
        try
        {
            var input = dateRaw.ToLower().Trim();

            // Очищаємо від днів тижня
            foreach (var dOfWeek in DaysOfWeek)
            {
                input = Regex.Replace(input, $@"\b{dOfWeek}[а-я]*\b", "");
            }
            input = input.Replace(",", " ").Replace(".", " ");
            input = Regex.Replace(input, @"\s+", " ").Trim();

            // Шукаємо число місяця
            var dayMatch = Regex.Match(input, @"\b(\d{1,2})\b");
            if (!dayMatch.Success) return null;
        
            // Оголошуємо змінні для конструктора DateTime
            int dayValue = int.Parse(dayMatch.Groups[1].Value); // назвав dayValue, щоб точно не було конфліктів
            int month = DateTime.Now.Month;
            int year = DateTime.Now.Year;
            
            bool monthFound = false;
            foreach (var m in Months)
            {
                if (input.Contains(m.Key))
                {
                    month = m.Value;
                    monthFound = true;
                    break;
                }
            }

            if (!monthFound) return null;
        
            if (month < DateTime.Now.Month - 1) 
            {
                year++;
            }
            
            int hour = 19; 
            int minute = 0;

            var timeMatch = Regex.Match(input, @"(\d{1,2})[:--](\d{2})");
            if (timeMatch.Success)
            {
                hour = int.Parse(timeMatch.Groups[1].Value);
                minute = int.Parse(timeMatch.Groups[2].Value);
            }
        
            return new DateTime(year, month, dayValue, hour, minute, 0);
        }
        catch
        {
            return null;
        }
    }
}