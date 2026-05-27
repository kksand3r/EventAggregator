namespace EventAggregator.Domain.Parsing;

public static class CityNormalizer
{
    private static readonly Dictionary<string, string> _normalized = new(StringComparer.OrdinalIgnoreCase)
    {
        { "kyiv", "Kyiv" },
        { "odesa", "Odesa" },
        { "dnipro", "Dnipro" },
        { "lviv", "Lviv" },
        { "kharkiv", "Kharkiv" },
        { "ivano-frankivsk", "Ivano-frankivsk" },
        { "vinnytsia", "Vinnytsia" },
        { "poltava", "Poltava" },
        { "zaporizhzhia", "Zaporizhzhia" },
        { "ternopil", "Ternopil" },
        { "rivne", "Rivne" },
        { "lutsk", "Lutsk" },
        { "mykolaiv", "Mykolaiv" },
        { "uzhhorod", "Uzhhorod" },
        { "kropyvnytskyi", "Kropyvnytskyi" },
        { "sumy", "Sumy" },
        { "zhytomyr", "Zhytomyr" }, // об'єднав Zhitomir/Zhytomyr
        { "chernivtsi", "Chernivtsi" },
        { "khmelnytskyi", "Khmelnytskyi" },
        { "chernihiv", "Chernihiv" }
    };

    public static string Normalize(string citySlug) 
    {
        string key = citySlug.ToLowerInvariant();
        return _normalized.ContainsKey(key) ? _normalized[key] : 
            char.ToUpper(key[0]) + key.Substring(1); // Авто-форматування для нових міст
    }
}