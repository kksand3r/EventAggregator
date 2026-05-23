FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["EventAggregator.sln", "./"]
COPY ["EventAggregator.Api/EventAggregator.Api.csproj", "EventAggregator.Api/"]
COPY ["EventAggregator.Application/EventAggregator.Application.csproj", "EventAggregator.Application/"]
COPY ["EventAggregator.Domain/EventAggregator.Domain.csproj", "EventAggregator.Domain/"]
COPY ["EventAggregator.Infrastructure/EventAggregator.Infrastructure.csproj", "EventAggregator.Infrastructure/"]

RUN dotnet restore "EventAggregator.Api/EventAggregator.Api.csproj"

COPY . .
WORKDIR "/src/EventAggregator.Api"
RUN dotnet publish "EventAggregator.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "EventAggregator.Api.dll"]