using System;
using System.Security.Cryptography;
using System.Text;

namespace EventAggregator.Domain.Models;

public class ScrapedEvent
{
    public string Id { get; set; } = string.Empty;
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
    
    public void GenerateDeterministicId()
    {
        // Беремо унікальні ознаки події (Назва + Місто + Дата) у нижньому регістрі
        var rawString = $"{Title}_{City}_{Date}".ToLowerInvariant();
        
        // Створюємо хеш і перетворюємо його на красивий стандартний UUID (Guid)
        using var md5 = MD5.Create();
        var hashBytes = md5.ComputeHash(Encoding.UTF8.GetBytes(rawString));
        Id = new Guid(hashBytes).ToString();
    }
}