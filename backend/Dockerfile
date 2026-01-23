FROM php:8.2-cli

RUN docker-php-ext-install pdo_mysql

# Install Python 3 and pip for ZKTeco sync service
RUN apt-get update && apt-get install -y python3 python3-pip git \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages pyzk requests

WORKDIR /app

EXPOSE 8000

CMD ["sh", "-lc", "php run_migration.php && exec php -S 0.0.0.0:8000 -t public public/index.php"]
