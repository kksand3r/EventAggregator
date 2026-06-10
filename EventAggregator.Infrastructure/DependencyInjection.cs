using Elastic.Clients.Elasticsearch;
using Microsoft.Extensions.DependencyInjection;
using System.Text.Json;
using EventAggregator.Domain.Interfaces;
using EventAggregator.Infrastructure.Repository;
using Microsoft.Extensions.Configuration;

namespace EventAggregator.Infrastructure;

public static class DependencyInjection
{
	public static IServiceCollection AddInfrastructure(
		this IServiceCollection services,
		IConfiguration configuration)
	{
		var elasticUrl = configuration["Elasticsearch:Url"] ?? "http://localhost:9200";

		var settings = new ElasticsearchClientSettings(new Uri(elasticUrl))
			.DefaultIndex("events")
			.DefaultFieldNameInferrer(p =>
				JsonNamingPolicy.CamelCase.ConvertName(p))
			.DisableDirectStreaming();

		services.AddSingleton(new ElasticsearchClient(settings));

		services.AddScoped<IEventRepository, ElasticEventRepository>();

		return services;
	}
}