using EventAggregator.Domain.Models;
using PuppeteerSharp;

namespace EventAggregator.Application.Interfaces;

public interface IEventScraper
{
    string ProviderName { get; }
    Task<List<ScrapedEvent>> ScrapeAsync(IBrowser browser);
}