FROM animcogn/face_recognition:cpu-latest

WORKDIR /app

RUN pip install --no-cache-dir flask==3.0.0

COPY app.py /app/app.py

EXPOSE 5000

CMD ["python", "/app/app.py"]
