using System.Runtime.InteropServices;
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
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                await new BrowserFetcher().DownloadAsync();
            }
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

        string proxyServerEnv = Environment.GetEnvironmentVariable("ProxyServer");
        string cleanProxyArg = string.Empty;

        if (!string.IsNullOrEmpty(proxyServerEnv))
        {
            try
            {
                var proxyUri = new Uri(proxyServerEnv);
                cleanProxyArg = $"--proxy-server={proxyUri.Scheme}://{proxyUri.Host}:{proxyUri.Port}";
                _logger.LogInformation("⚙️ Налаштовано проксі-сервер для Chromium: {Scheme}:" +
                                       "//" +
                                       "" +
                                       "{Host}:{Port}",
                    proxyUri.Scheme, proxyUri.Host, proxyUri.Port);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "⚠️ Не вдалося розпарсити рядок ProxyServer: {Url}", proxyServerEnv);
            }
        }

        try
        {
            LaunchOptions launchOptions;

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                launchOptions = new LaunchOptions
                {
                    Headless = true,
                    ExecutablePath = "/usr/bin/chromium",
                    Args = new[]
                    {
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                        "--disable-software-rasterizer",
                        "--disable-blink-features=AutomationControlled",
                        "--window-size=1920,1080",
                        cleanProxyArg
                    }.Where(arg => !string.IsNullOrEmpty(arg)).ToArray()
                };
            }
            else
            {
                launchOptions = new LaunchOptions
                {
                    Headless = true,
                    Args = new[]
                    {
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-blink-features=AutomationControlled",
                        "--window-size=1920,1080",
                        cleanProxyArg
                    }.Where(arg => !string.IsNullOrEmpty(arg)).ToArray()
                };
            }

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
            Environment.Exit(0);
        }
    }
}