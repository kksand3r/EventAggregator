using EventAggregator.Application.Services;
using EventAggregator.Domain.Interfaces;
using EventAggregator.Infrastructure;
using EventAggregator.Infrastructure.Scrapers;
using EventAggregator.Collector.Services;
using System.Text;
using EventAggregator.Application.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Serilog;

Console.OutputEncoding = Encoding.UTF8;

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Debug()
    .WriteTo.Console()
    .WriteTo.File("logs/aggregator-log-.txt",
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 7)
    .CreateLogger();

try
{
    Log.Information("=== 🚀 СЕРВІС EVENT AGGREGATOR ЗАПУСКАЄТЬСЯ ===");

    var builder = Host.CreateApplicationBuilder(args);

    builder.Logging.ClearProviders();
    builder.Logging.AddSerilog();
    
    builder.Services.AddInfrastructure(builder.Configuration);

    builder.Services.AddTransient<ScrapingService>();
    
    builder.Services.AddTransient<IEventScraper, KarabasScraper>();
    builder.Services.AddTransient<IEventScraper, ConcertUaScraper>();


    builder.Services.AddHostedService<ScrapingWorker>();

    var host = builder.Build();
    await host.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Додаток припинив роботу через критичну помилку при запуску");
}
finally
{
    Log.CloseAndFlush();
}