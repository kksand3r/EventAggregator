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

        public EventsController(ElasticsearchClient client, HttpClient httpClient, IConfiguration config)
        {
            _client = client;
            _httpClient = httpClient;
            _mcpBridgeUrl = config["McpBridgeUrl"] ?? "http://localhost:5001";
        }

        [HttpGet("ai-search")]
        public async Task<IActionResult> AiSearch([FromQuery] string? query)
        {
            if (string.IsNullOrWhiteSpace(query))
                return Ok(new
                    { AgentMessage = "Привіт! Яких подій ви шукаєте?", Events = Enumerable.Empty<EventDto>() });

            try
            {
                var requestBody = new { query = query };
                var content = new StringContent(
                    JsonSerializer.Serialize(requestBody),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await _httpClient.PostAsync($"{_mcpBridgeUrl}/api/mcp-search", content);

                if (!response.IsSuccessStatusCode)
                    return StatusCode((int)response.StatusCode,
                        "Тимчасово не вдалося зв'язатися з сервісом ШІ-аналітики.");

                var jsonResponse = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(jsonResponse);

                var agentMessage = doc.RootElement.GetProperty("agentMessage").GetString();
                var rawMcpData = doc.RootElement.GetProperty("rawMcpData");

                var eventsList = new List<EventDto>();

                if (rawMcpData.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in rawMcpData.EnumerateArray())
                    {
                        if (item.TryGetProperty("text", out var textProp))
                        {
                            var hitText = textProp.GetString();
                            if (string.IsNullOrWhiteSpace(hitText)) continue;

                            try
                            {
                                using var esDoc = JsonDocument.Parse(hitText);

                                if (esDoc.RootElement.TryGetProperty("hits", out var topHits) &&
                                    topHits.TryGetProperty("hits", out var hitsArray))
                                {
                                    foreach (var hit in hitsArray.EnumerateArray())
                                    {
                                        if (hit.TryGetProperty("_source", out var source))
                                        {
                                            var scrapedEvent = JsonSerializer.Deserialize<ScrapedEvent>(
                                                source.GetRawText(), new JsonSerializerOptions
                                                {
                                                    PropertyNameCaseInsensitive = true
                                                });

                                            if (scrapedEvent != null)
                                            {
                                                if (string.IsNullOrEmpty(scrapedEvent.Id) &&
                                                    hit.TryGetProperty("_id", out var idProp))
                                                {
                                                    scrapedEvent.Id = idProp.GetString() ?? Guid.NewGuid().ToString();
                                                }

                                                eventsList.Add(scrapedEvent.ToDto());
                                            }
                                        }
                                    }
                                }
                                else if (esDoc.RootElement.ValueKind == JsonValueKind.Array)
                                {
                                    foreach (var hit in esDoc.RootElement.EnumerateArray())
                                    {
                                        var source = hit.TryGetProperty("_source", out var s) ? s : hit;
                                        var scrapedEvent = JsonSerializer.Deserialize<ScrapedEvent>(source.GetRawText(),
                                            new JsonSerializerOptions
                                            {
                                                PropertyNameCaseInsensitive = true
                                            });

                                        if (scrapedEvent != null)
                                        {
                                            if (string.IsNullOrEmpty(scrapedEvent.Id) &&
                                                hit.TryGetProperty("_id", out var idProp))
                                            {
                                                scrapedEvent.Id = idProp.GetString() ?? Guid.NewGuid().ToString();
                                            }

                                            eventsList.Add(scrapedEvent.ToDto());
                                        }
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"Помилка парсингу результатів MCP: {ex.Message}");
                            }
                        }
                    }
                }

                var uniqueEvents = eventsList.GroupBy(e => e.Id).Select(g => g.First()).ToList();

                return Ok(new
                {
                    AgentMessage = agentMessage,
                    Events = uniqueEvents
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

            return response.IsValidResponse
                ? Ok(response.Documents.Select(d => d.ToDto()))
                : StatusCode(500, response.DebugInformation);
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
        public async Task<IActionResult> GetAll(
            [FromQuery] string? city,
            [FromQuery] string? category,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            int from = (page - 1) * pageSize;
            var now = DateTime.UtcNow;

            var filters = new List<Action<QueryDescriptor<ScrapedEvent>>>
            {
                f => f.Range(r => r.DateRange(dr => dr.Field(ev => ev.ParsedDate).Gte(now)))
            };

            // ✅ ВИПРАВЛЕНО: Шукаємо по точному Keyword-полю "city" у нижньому регістрі (слаг)
            if (!string.IsNullOrWhiteSpace(city) && city != "All")
                filters.Add(f => f.Term(t => t.Field(ev => ev.City).Value(city.ToLowerInvariant())));

            if (!string.IsNullOrWhiteSpace(category) && category != "All")
                filters.Add(f => f.Term(t => t.Field("category.keyword").Value(category.ToLowerInvariant())));

            var response = await _client.SearchAsync<ScrapedEvent>(s => s
                .From(from)
                .Size(pageSize)
                .Sort(sort => sort.Field(f => f.ParsedDate, d => d.Order(SortOrder.Asc)))
                .Query(q => q.Bool(b => b.Filter(filters.ToArray())))
            );

            return response.IsValidResponse
                ? Ok(new
                {
                    Total = response.Total, Page = page, PageSize = pageSize,
                    Data = response.Documents.Select(d => d.ToDto())
                })
                : StatusCode(500, response.DebugInformation);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(string id)
        {
            var response = await _client.GetAsync<ScrapedEvent>("events", id);

            if (response.IsValidResponse && response.Source != null)
                return Ok(response.Source.ToDto());

            return NotFound();
        }

        [HttpGet("metadata")]
        public async Task<IActionResult> GetMetadata()
        {
            var response = await _client.SearchAsync<ScrapedEvent>(s => s.Index("events").Size(0).Aggregations(a => a
                // ✅ ВИПРАВЛЕНО: Агрегація будується по чистому Keyword-полю "city"
                .Add("unique_cities", ag => ag.Terms(t => t.Field(ev => ev.City).Size(100)))
                .Add("unique_categories", ag => ag.Terms(t => t.Field("category.keyword").Size(50)))
            ));

            if (!response.IsValidResponse) return StatusCode(500, response.DebugInformation);

            return Ok(new EventMetadataDto
            {
                Cities = response.Aggregations.GetStringTerms("unique_cities")?.Buckets.Select(b => b.Key.ToString())
                    .OrderBy(c => c).ToList() ?? new(),
                Categories = response.Aggregations.GetStringTerms("unique_categories")?.Buckets
                    .Select(b => b.Key.ToString()).OrderBy(c => c).ToList() ?? new()
            });
        }

        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            var response = await _client.SearchAsync<ScrapedEvent>(s => s.Index("events").Size(0).Aggregations(a => a
                // ✅ ВИПРАВЛЕНО: Статистика збирається по чистому Keyword-полю "city"
                .Add("events_by_city", ag => ag.Terms(t => t.Field(ev => ev.City).Size(10)))
                .Add("events_by_category", ag => ag.Terms(t => t.Field("category.keyword").Size(10)))
            ));

            if (!response.IsValidResponse) return StatusCode(500, response.DebugInformation);

            return Ok(new
            {
                ByCity = response.Aggregations.GetStringTerms("events_by_city")?.Buckets
                    .ToDictionary(b => b.Key.ToString(), b => b.DocCount) ?? new(),
                ByCategory = response.Aggregations.GetStringTerms("events_by_category")?.Buckets
                    .ToDictionary(b => b.Key.ToString(), b => b.DocCount) ?? new()
            });
        }

        [HttpPost("{id}/view")]
        public async Task<IActionResult> IncrementView(string id)
        {
            var request = new UpdateRequest<ScrapedEvent, ScrapedEvent>("events", id)
            {
                Script = new Script(new InlineScript(
                    "if (ctx._source.viewsCount == null) { ctx._source.viewsCount = 1 } else { ctx._source.viewsCount += 1 }"))
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
                    .Filter(f => f.Range(r => r.DateRange(dr => dr.Field(ev => ev.ParsedDate).Lt(now))))
                ))
            );

            return response.IsValidResponse
                ? Ok(new
                {
                    Total = response.Total, Page = page, PageSize = pageSize,
                    Data = response.Documents.Select(d => d.ToDto())
                })
                : StatusCode(500, response.DebugInformation);
        }
    }
}