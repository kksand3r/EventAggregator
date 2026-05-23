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
    builder.Services.AddTransient<ScrapingService>();
    builder.Services.AddTransient<IEventScraper, KarabasScraper>();
    builder.Services.AddTransient<IEventScraper, ConcertUaScraper>();

    using var host = builder.Build();


    Log.Information("🌐 Підготовка браузера...");

    var scrapingService = host.Services.GetRequiredService<ScrapingService>();
    
    using (var browser = await Puppeteer.LaunchAsync(new LaunchOptions 
           { 
               Headless = true,
               ExecutablePath = "/usr/bin/chromium",  // ← вкажи шлях явно
               Args = new[] { "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage" }
           }))
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