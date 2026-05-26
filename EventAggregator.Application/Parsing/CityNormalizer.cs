namespace EventAggregator.Domain.Parsing;

public static class CityNormalizer
{
    private static readonly Dictionary<string, string> _normalized = new(StringComparer.OrdinalIgnoreCase)
    {
        { "kyiv", "KYIV" },
        { "odesa", "ODESA" },
        { "dnipro", "DNIPRO" },
        { "lviv", "LVIV" },
        { "kharkiv", "KHARKIV" },
        { "ivano-frankivsk", "IVANO-FRANKIVSK" },
        { "vinnytsia", "VINNYTSIA" },
        { "poltava", "POLTAVA" },
        { "zaporizhzhia", "ZAPORIZHZHIA" },
        { "ternopil", "TERNOPIL" },
        { "rivne", "RIVNE" },
        { "lutsk", "LUTSK" },
        { "mykolaiv", "MYKOLAIV" },
        { "uzhhorod", "UZHHOROD" },
        { "kropyvnytskyi", "KROPYVNYTSKYI" },
        { "sumy", "SUMY" },
        { "zhitomir", "ZHYTOMYR" },
        { "chernivtsy", "CHERNIVTSI" },
        { "khmelnitsky", "KHMELNYTSKYI" },
        { "chernigiv", "CHERNIHIV" },
        { "zhytomyr", "ZHYTOMYR" },
        { "chernivtsi", "CHERNIVTSI" },
        { "khmelnytskyi", "KHMELNYTSKYI" },
        { "chernihiv", "CHERNIHIV" },
    };

    public static string Normalize(string citySlug) =>
        _normalized.GetValueOrDefault(citySlug.ToLower(), citySlug.ToUpper());
}