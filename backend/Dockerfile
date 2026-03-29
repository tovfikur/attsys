FROM php:8.2-cli

# Install PHP extensions
RUN docker-php-ext-install pdo_mysql

# Enable and tune OPcache for faster script execution
RUN docker-php-ext-enable opcache
RUN echo "opcache.enable=1" >> /usr/local/etc/php/conf.d/opcache.ini \
 && echo "opcache.enable_cli=1" >> /usr/local/etc/php/conf.d/opcache.ini \
 && echo "opcache.memory_consumption=128" >> /usr/local/etc/php/conf.d/opcache.ini \
 && echo "opcache.interned_strings_buffer=16" >> /usr/local/etc/php/conf.d/opcache.ini \
 && echo "opcache.max_accelerated_files=4000" >> /usr/local/etc/php/conf.d/opcache.ini \
 && echo "opcache.revalidate_freq=0" >> /usr/local/etc/php/conf.d/opcache.ini \
 && echo "opcache.fast_shutdown=1" >> /usr/local/etc/php/conf.d/opcache.ini

# General PHP performance settings
RUN echo "realpath_cache_size=4096k" >> /usr/local/etc/php/conf.d/perf.ini \
 && echo "realpath_cache_ttl=600" >> /usr/local/etc/php/conf.d/perf.ini \
 && echo "output_buffering=Off" >> /usr/local/etc/php/conf.d/perf.ini \
 && echo "zlib.output_compression=Off" >> /usr/local/etc/php/conf.d/perf.ini

# Install Python 3 and pip for ZKTeco sync service
RUN apt-get -o Acquire::Check-Valid-Until=false update && apt-get install -y python3 python3-pip git \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages pyzk requests

WORKDIR /app

EXPOSE 8000

CMD ["sh", "-lc", "php run_migration.php && exec php -S 0.0.0.0:8000 -t public public/index.php"]
