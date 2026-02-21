using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PuppeteerSharp;
using EventAggregator.Application.Services;

namespace EventAggregator.Collector.Services;

public class ScrapingWorker : BackgroundService
{
    private readonly ILogger<ScrapingWorker> _logger;
    private readonly ScrapingService _scrapingService;
    private readonly IHostApplicationLifetime _hostApplicationLifetime; 

    public ScrapingWorker(
        ILogger<ScrapingWorker> logger, 
        ScrapingService scrapingService,
        IHostApplicationLifetime hostApplicationLifetime)
    {
        _logger = logger;
        _scrapingService = scrapingService;
        _hostApplicationLifetime = hostApplicationLifetime;
    }

    public override async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("🌐 Підготовка браузера для Cron-завдання...");
        try 
        {
            await new BrowserFetcher().DownloadAsync();
        }
        catch (Exception ex)
        {
            _logger.LogCritical(ex, "❌ Не вдалося підготувати браузер.");
            throw;
        }

        await base.StartAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("🚀 Початок сесії скрайпінгу: {time}", DateTimeOffset.Now);

        try
        {
            using (var browser = await Puppeteer.LaunchAsync(new LaunchOptions 
                   { 
                       Headless = true,
                       Args = new[] { "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage" }
                   }))
            {
                await _scrapingService.ProcessAllSourcesAsync(browser, stoppingToken);
                await browser.CloseAsync();
            }

            _logger.LogInformation("✅ Скрайпінг успішно завершено. Завершення процесу...");
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("⚠️ Операція була скасована.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "❌ Критична помилка під час виконання Cron-завдання.");
        }
        finally
        {
            _hostApplicationLifetime.StopApplication();
        }
    }
}