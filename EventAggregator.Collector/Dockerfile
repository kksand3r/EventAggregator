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

RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "EventAggregator.Collector.dll"]