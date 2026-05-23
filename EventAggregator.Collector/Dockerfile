FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["EventAggregator.sln", "./"]
COPY ["EventAggregator.Collector/EventAggregator.Collector.csproj", "EventAggregator.Collector/"]
COPY ["EventAggregator.Application/EventAggregator.Application.csproj", "EventAggregator.Application/"]
COPY ["EventAggregator.Domain/EventAggregator.Domain.csproj", "EventAggregator.Domain/"]
COPY ["EventAggregator.Infrastructure/EventAggregator.Infrastructure.csproj", "EventAggregator.Infrastructure/"]
RUN dotnet restore "EventAggregator.Collector/EventAggregator.Collector.csproj"

COPY . .
WORKDIR "/src/EventAggregator.Collector"
RUN dotnet publish "EventAggregator.Collector.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final

# Встановлення Chromium та залежностей
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "EventAggregator.Collector.dll"]