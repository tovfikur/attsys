FROM php:8.2-cli

RUN docker-php-ext-install pdo_mysql

WORKDIR /app

EXPOSE 8000

CMD ["sh", "-lc", "php run_migration.php && exec php -S 0.0.0.0:8000 -t public public/index.php"]
