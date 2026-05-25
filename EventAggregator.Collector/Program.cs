using EventAggregator.Application.Services;
using EventAggregator.Domain.Interfaces;
using EventAggregator.Infrastructure;
using EventAggregator.Infrastructure.Scrapers;
using EventAggregator.Application.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Serilog;
using System.Text;
using PuppeteerSharp; 
using System.Runtime.InteropServices; 

Console.OutputEncoding = Encoding.UTF8;

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Debug()
    .WriteTo.Console()
    .CreateLogger();

try
{
    Log.Information("=== 🚀 ЗАПУСК СКРЕЙПІНГУ (JOB MODE) ===");

    var builder = Host.CreateApplicationBuilder(args);
    builder.Logging.ClearProviders();
    builder.Logging.AddSerilog();

    builder.Services.AddInfrastructure(builder.Configuration);
    
    builder.Services.AddHttpClient<GeminiService>();
    builder.Services.AddTransient<GeminiService>();

    builder.Services.AddTransient<ScrapingService>();

    builder.Services.AddTransient<IEventScraper, KarabasScraper>();
    builder.Services.AddTransient<IEventScraper, ConcertUaScraper>();

    using var host = builder.Build();

    Log.Information("🌐 Підготовка браузера...");

    LaunchOptions launchOptions;
    
    if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
    {
        Log.Information("🐧 Виявлено Linux (Сервер). Перевіряємо системний Chromium...");
        
        if (!System.IO.File.Exists("/usr/bin/chromium"))
        {
            Log.Fatal("❌ Файл браузера НЕ знайдено за шляхом /usr/bin/chromium.");
            return; 
        }
        
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
                "--window-size=1920,1080",
                "--start-maximized"
            }
        };
    }
    else
    {
        Log.Information("💻 Виявлено Windows/Mac. Завантажуємо локальний Chromium для розробки...");
        var browserFetcher = new BrowserFetcher();
        await browserFetcher.DownloadAsync();
        
        launchOptions = new LaunchOptions 
        { 
            Headless = true,
            Args = new[] 
            { 
                "--no-sandbox", 
                "--disable-setuid-sandbox", 
                "--disable-dev-shm-usage",
                "--disable-gpu", 
                "--disable-software-rasterizer",
                "--window-size=1920,1080"
            }
        };
    }

    var scrapingService = host.Services.GetRequiredService<ScrapingService>();
    
    using (var browser = await Puppeteer.LaunchAsync(launchOptions))
    {
        Log.Information("🚀 Початок сесії скрайпінгу...");
        await scrapingService.ProcessAllSourcesAsync(browser, CancellationToken.None);
        await browser.CloseAsync();
    }

    Log.Information("✅ Скрайпінг успішно завершено!");
}
catch (Exception ex)
{
    Log.Fatal(ex, "❌ Критична помилка під час виконання");
}
finally
{
    Log.CloseAndFlush();
}