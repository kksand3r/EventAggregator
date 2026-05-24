using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
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

        // Отримуємо проксі з оточення (PROXY_SERVER у .env)
        string proxyServer = Environment.GetEnvironmentVariable("ProxyServer");

        try
        {
            var launchOptions = new LaunchOptions 
            { 
                Headless = true,
                Args = new[] 
                { 
                    "--no-sandbox", 
                    "--disable-setuid-sandbox", 
                    "--disable-dev-shm-usage", 
                    "--disable-blink-features=AutomationControlled",
                    // Додаємо проксі, якщо він заданий
                    !string.IsNullOrEmpty(proxyServer) ? $"--proxy-server={proxyServer}" : "",
                    "--window-size=1920,1080",
                    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                }.Where(arg => !string.IsNullOrEmpty(arg)).ToArray() // Фільтруємо пусті рядки
            };

            using (var browser = await Puppeteer.LaunchAsync(launchOptions))
            {
                await _scrapingService.ProcessAllSourcesAsync(browser, stoppingToken);
                await browser.CloseAsync();
            }
            _logger.LogInformation("✅ Скрайпінг успішно завершено.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "❌ Критична помилка під час виконання скрайпінгу.");
        }
        finally
        {
            _hostApplicationLifetime.StopApplication();
            Environment.Exit(0); // Гарантоване завершення процесу
        }
    }
}