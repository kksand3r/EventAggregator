using Microsoft.AspNetCore.Mvc;
using Elastic.Clients.Elasticsearch;
using EventAggregator.Domain.Models;
using EventAggregator.Api.DTOs;
using Elastic.Clients.Elasticsearch.QueryDsl;
using EventAggregator.Application.Services;

namespace EventAggregator.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class EventsController : ControllerBase
    {
        private readonly ElasticsearchClient _client;

        public EventsController(ElasticsearchClient client)
        {
            _client = client;
        }

        [HttpGet("ai-search")]
        public async Task<IActionResult> AiSearch([FromQuery] string? query, [FromServices] GeminiService gemini, [FromQuery] int size = 5)
        {
            if (string.IsNullOrWhiteSpace(query))
                return Ok(Enumerable.Empty<EventDto>());
            
            var keywords = await gemini.GetSearchKeywordsAsync(query);

            if (keywords == null || keywords.Length == 0)
                return await Search(query, size);

            var response = await _client.SearchAsync<ScrapedEvent>(s => s
                .Size(size)
                .Query(q => q
                    .Bool(b => b
                        .Should(sh => sh
                            .MultiMatch(mm => mm
                                .Fields(new[] { "category^3", "title^2", "description" })
                                .Query(string.Join(" ", keywords))
                                .Fuzziness(new Fuzziness("AUTO"))
                            )
                        )
                    )
                )
            );

            if (!response.IsValidResponse)
                return StatusCode(500, response.DebugInformation);

            return Ok(response.Documents.Select(d => d.ToDto()));
        }

        [HttpGet("search")]
        [HttpGet("search")]
        public async Task<IActionResult> Search([FromQuery] string? query, [FromQuery] string? city, [FromQuery] int size = 20)
        {
            if (string.IsNullOrWhiteSpace(query) && string.IsNullOrWhiteSpace(city))
                return Ok(Enumerable.Empty<EventDto>());

            var response = await _client.SearchAsync<ScrapedEvent>(s => s
                .Size(size)
                .Query(q => q
                    .Bool(b => {
                        var must = new List<Query>();

                        if (!string.IsNullOrWhiteSpace(query))
                        {
                            must.Add(new MultiMatchQuery
                            {
                                Fields = new[] { "title^2", "description", "category" },
                                Query = query,
                                Fuzziness = new Fuzziness("AUTO"),
                                Type = TextQueryType.BestFields
                            });
                        }

                        if (!string.IsNullOrWhiteSpace(city))
                        {
                            must.Add(new TermQuery(new Field("city.keyword")) { Value = city });
                        }

                        b.Must(must.ToArray());
                    })
                )
            );

            if (!response.IsValidResponse)
                return StatusCode(500, response.DebugInformation);

            return Ok(response.Documents.Select(d => d.ToDto()));
        }

        [HttpGet("{id}/ai-summary")]
        public async Task<IActionResult> GetAiSummary(string id, [FromServices] GeminiService gemini)
        {
            var response = await _client.GetAsync<ScrapedEvent>("events", id);

            if (!response.IsValidResponse || response.Source == null)
            {
                return NotFound(new { Message = $"Подію з ID {id} не знайдено для аналізу." });
            }

            var summary = await gemini.SummarizeEventAsync(
                response.Source.Title,
                response.Source.Description
            );

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

            var response = await _client.SearchAsync<ScrapedEvent>(s =>
            {
                s.From(from)
                 .Size(pageSize)
                 .Sort(sort => sort.Field(f => f.ParsedDate, d => d.Order(SortOrder.Asc)));

                if (!string.IsNullOrEmpty(city) || !string.IsNullOrEmpty(category))
                {
                    s.Query(q => q.Bool(b => b.Must(m => 
                    {
                        if (!string.IsNullOrEmpty(city)) m.Term(t => t.Field("city.keyword").Value(city));
                        if (!string.IsNullOrEmpty(category)) m.Term(t => t.Field("category.keyword").Value(category));
                    })));
                }
                else
                {
                    s.Query(q => q.MatchAll(m => { }));
                }
            });

            if (!response.IsValidResponse)
                return StatusCode(500, response.DebugInformation);

            return Ok(new
            {
                Total = response.Total,
                Page = page,
                PageSize = pageSize,
                Data = response.Documents.Select(d => d.ToDto())
            });
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(string id)
        {
            var response = await _client.GetAsync<ScrapedEvent>("events", id);

            if (!response.IsValidResponse || response.Source == null)
            {
                return NotFound(new { Message = $"Подію з ID {id} не знайдено." });
            }

            return Ok(response.Source.ToDto());
        }

        [HttpGet("metadata")]
        public async Task<IActionResult> GetMetadata()
        {
            var response = await _client.SearchAsync<ScrapedEvent>(s => s
                .Index("events")
                .Size(0)
                .Aggregations(a => a
                    .Add("unique_cities", ag => ag.Terms(t => t.Field("city.keyword").Size(100)))
                    .Add("unique_categories", ag => ag.Terms(t => t.Field("category.keyword").Size(50)))
                )
            );

            if (!response.IsValidResponse)
                return StatusCode(500, response.DebugInformation);

            var metadata = new EventMetadataDto();
            var cityBucket = response.Aggregations.GetStringTerms("unique_cities");
            var categoryBucket = response.Aggregations.GetStringTerms("unique_categories");

            if (cityBucket != null) metadata.Cities = cityBucket.Buckets.Select(b => b.Key.ToString()).OrderBy(c => c).ToList();
            if (categoryBucket != null) metadata.Categories = categoryBucket.Buckets.Select(b => b.Key.ToString()).OrderBy(c => c).ToList();

            return Ok(metadata);
        }

        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            var response = await _client.SearchAsync<ScrapedEvent>(s => s
                .Index("events")
                .Size(0)
                .Aggregations(a => a
                    .Add("events_by_city", ag => ag.Terms(t => t.Field("city.keyword").Size(10)))
                    .Add("events_by_category", ag => ag.Terms(t => t.Field("category.keyword").Size(10)))
                )
            );

            if (!response.IsValidResponse)
                return StatusCode(500, response.DebugInformation);

            var cityBucket = response.Aggregations.GetStringTerms("events_by_city");
            var categoryBucket = response.Aggregations.GetStringTerms("events_by_category");

            return Ok(new
            {
                ByCity = cityBucket?.Buckets.ToDictionary(b => b.Key.ToString(), b => b.DocCount) ?? new Dictionary<string, long>(),
                ByCategory = categoryBucket?.Buckets.ToDictionary(b => b.Key.ToString(), b => b.DocCount) ?? new Dictionary<string, long>()
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
    }
}