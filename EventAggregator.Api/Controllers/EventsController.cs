using Microsoft.AspNetCore.Mvc;
using Elastic.Clients.Elasticsearch;
using EventAggregator.Domain.Models;
using EventAggregator.Api.DTOs;
using Elastic.Clients.Elasticsearch.QueryDsl;
using EventAggregator.Application.Services;
using System.Text;
using System.Text.Json;

namespace EventAggregator.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class EventsController : ControllerBase
    {
        private readonly ElasticsearchClient _client;
        private readonly HttpClient _httpClient;
        private readonly string _mcpBridgeUrl;

        // Додаємо HttpClient та IConfiguration через DI конструктора
        public EventsController(ElasticsearchClient client, HttpClient httpClient, IConfiguration config)
        {
            _client = client;
            _httpClient = httpClient;
            // Беремо URL мікросервісу з конфігурації (яку ми прописали в docker-compose)
            _mcpBridgeUrl = config["McpBridgeUrl"] ?? "http://localhost:5001";
        }

[HttpGet("ai-search")]
public async Task<IActionResult> AiSearch([FromQuery] string? query)
{
    if (string.IsNullOrWhiteSpace(query)) 
        return Ok(new { AgentMessage = "Привіт! Яких подій ви шукаєте?", Events = Enumerable.Empty<EventDto>() });

    try
    {
        var requestBody = new { query = query };
        var content = new StringContent(
            JsonSerializer.Serialize(requestBody), 
            Encoding.UTF8, 
            "application/json"
        );

        // 1. Запит до нашого Node.js MCP проксі-мосту
        var response = await _httpClient.PostAsync($"{_mcpBridgeUrl}/api/mcp-search", content);
        
        if (!response.IsSuccessStatusCode)
        {
            return StatusCode((int)response.StatusCode, "Тимчасово не вдалося зв'язатися з сервісом ШІ-аналітики.");
        }

        var jsonResponse = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(jsonResponse);
        
        var agentMessage = doc.RootElement.GetProperty("agentMessage").GetString();
        var rawMcpData = doc.RootElement.GetProperty("rawMcpData");

        var eventsList = new List<EventDto>();
        
        // 2. ✅ ПРАВИЛЬНИЙ ПАРСИНГ: Розбираємо структуру відповіді MCP-сервера Elastic
        if (rawMcpData.ValueKind == JsonValueKind.Array && rawMcpData.GetArrayLength() > 0)
        {
            // Отримуємо перший блок контенту з типом text
            var firstBlock = rawMcpData[0];
            if (firstBlock.TryGetProperty("text", out var textProp))
            {
                var elasticResponseText = textProp.GetString();
                if (!string.IsNullOrWhiteSpace(elasticResponseText))
                {
                    // Парсимо внутрішній сирий JSON відповіді від самого Elasticsearch
                    using var elasticDoc = JsonDocument.Parse(elasticResponseText);
                    
                    // Пробиваємось крізь структуру hits -> hits (масив знайдених документів)
                    if (elasticDoc.RootElement.TryGetProperty("hits", out var hitsObj) &&
                        hitsObj.TryGetProperty("hits", out var hitsArray))
                    {
                        foreach (var hit in hitsArray.EnumerateArray())
                        {
                            // Дістаємо чисте тіло документа з поля _source
                            if (hit.TryGetProperty("_source", out var sourceObj))
                            {
                                var scrapedEvent = JsonSerializer.Deserialize<ScrapedEvent>(sourceObj.GetRawText(), new JsonSerializerOptions
                                {
                                    PropertyNameCaseInsensitive = true
                                });

                                if (scrapedEvent != null)
                                {
                                    eventsList.Add(scrapedEvent.ToDto());
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Віддаємо на фронтенд текст для блоку асистента та повноцінний масив подій для клікабельних карток
        return Ok(new 
        { 
            AgentMessage = agentMessage, 
            Events = eventsList 
        });
    }
    catch (Exception ex)
    {
        return StatusCode(500, new { Message = $"Помилка інтеграції MCP агента: {ex.Message}" });
    }
}

        [HttpGet("search")]
        public async Task<IActionResult> Search([FromQuery] string? query, [FromQuery] int size = 20)
        {
            if (string.IsNullOrWhiteSpace(query)) return Ok(Enumerable.Empty<EventDto>());

            var response = await _client.SearchAsync<ScrapedEvent>(s => s
                .Size(size)
                .Query(q => q.MultiMatch(mm => mm
                    .Fields(new[] { "title^2", "description", "category" })
                    .Query(query)
                    .Fuzziness(new Fuzziness("AUTO"))
                    .Type(TextQueryType.BestFields)
                ))
            );

            return response.IsValidResponse ? Ok(response.Documents.Select(d => d.ToDto())) : StatusCode(500, response.DebugInformation);
        }

        [HttpGet("{id}/ai-summary")]
        public async Task<IActionResult> GetAiSummary(string id, [FromServices] GeminiService gemini)
        {
            var response = await _client.GetAsync<ScrapedEvent>("events", id);

            if (!response.IsValidResponse || response.Source == null)
                return NotFound(new { Message = $"Подію з ID {id} не знайдено." });

            var summary = await gemini.SummarizeEventAsync(response.Source.Title, response.Source.Description);
            return Ok(new { Summary = summary });
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] string? city, [FromQuery] string? category, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            int from = (page - 1) * pageSize;
            var now = DateTime.UtcNow;

            var response = await _client.SearchAsync<ScrapedEvent>(s => s
                .From(from)
                .Size(pageSize)
                .Sort(sort => sort.Field(f => f.ParsedDate, d => d.Order(SortOrder.Asc)))
                .Query(q => q.Bool(b =>
                {
                    b.Filter(f => f.Range(r => r.DateRange(dr => dr.Field(ev => ev.ParsedDate).Gte(now))));
                    
                    if (!string.IsNullOrWhiteSpace(city) && city != "All")
                        b.Filter(f => f.Term(t => t.Field("city.keyword").Value(city.ToUpper())));
                    
                    if (!string.IsNullOrWhiteSpace(category) && category != "All")
                        b.Filter(f => f.Term(t => t.Field("category.keyword").Value(category.ToLower())));
                }))
            );

            return response.IsValidResponse 
                ? Ok(new { Total = response.Total, Page = page, PageSize = pageSize, Data = response.Documents.Select(d => d.ToDto()) }) 
                : StatusCode(500, response.DebugInformation);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(string id)
        {
            var response = await _client.GetAsync<ScrapedEvent>("events", id);
            return (response.IsValidResponse && response.Source != null) ? Ok(response.Source.ToDto()) : NotFound();
        }

        [HttpGet("metadata")]
        public async Task<IActionResult> GetMetadata()
        {
            var response = await _client.SearchAsync<ScrapedEvent>(s => s.Index("events").Size(0).Aggregations(a => a
                .Add("unique_cities", ag => ag.Terms(t => t.Field("city.keyword").Size(100)))
                .Add("unique_categories", ag => ag.Terms(t => t.Field("category.keyword").Size(50)))
            ));

            if (!response.IsValidResponse) return StatusCode(500, response.DebugInformation);

            return Ok(new EventMetadataDto
            {
                Cities = response.Aggregations.GetStringTerms("unique_cities")?.Buckets.Select(b => b.Key.ToString()).OrderBy(c => c).ToList() ?? new(),
                Categories = response.Aggregations.GetStringTerms("unique_categories")?.Buckets.Select(b => b.Key.ToString()).OrderBy(c => c).ToList() ?? new()
            });
        }

        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            var response = await _client.SearchAsync<ScrapedEvent>(s => s.Index("events").Size(0).Aggregations(a => a
                .Add("events_by_city", ag => ag.Terms(t => t.Field("city.keyword").Size(10)))
                .Add("events_by_category", ag => ag.Terms(t => t.Field("category.keyword").Size(10)))
            ));

            if (!response.IsValidResponse) return StatusCode(500, response.DebugInformation);

            return Ok(new
            {
                ByCity = response.Aggregations.GetStringTerms("events_by_city")?.Buckets.ToDictionary(b => b.Key.ToString(), b => b.DocCount) ?? new(),
                ByCategory = response.Aggregations.GetStringTerms("events_by_category")?.Buckets.ToDictionary(b => b.Key.ToString(), b => b.DocCount) ?? new()
            });
        }

        [HttpPost("{id}/view")]
        public async Task<IActionResult> IncrementView(string id)
        {
            var request = new UpdateRequest<ScrapedEvent, ScrapedEvent>("events", id)
            {
                Script = new Script(new InlineScript("if (ctx._source.viewsCount == null) { ctx._source.viewsCount = 1 } else { ctx._source.viewsCount += 1 }"))
            };
            var response = await _client.UpdateAsync(request);
            return response.IsValidResponse ? Ok() : StatusCode(500, response.DebugInformation);
        }
        
        [HttpGet("archive")]
        public async Task<IActionResult> GetArchive([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            int from = (page - 1) * pageSize;
            var now = DateTime.UtcNow;

            var response = await _client.SearchAsync<ScrapedEvent>(s => s
                .From(from)
                .Size(pageSize)
                .Sort(sort => sort.Field(f => f.ParsedDate, d => d.Order(SortOrder.Desc)))
                .Query(q => q.Bool(b => b
                    .Filter(f => f.Range(r => r.DateRange(dr => dr.Field(f => f.ParsedDate).Lt(now))))
                ))
            );

            return response.IsValidResponse 
                ? Ok(new { Total = response.Total, Page = page, PageSize = pageSize, Data = response.Documents.Select(d => d.ToDto()) }) 
                : StatusCode(500, response.DebugInformation);
        }
    }
}