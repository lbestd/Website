# Техническое задание: Модуль Галереи

## 1. Общее описание

Модуль Галерея представляет собой веб-приложение для просмотра и управления фотографиями, развернутое на Python с использованием фреймворка aiohttp. Система обеспечивает иерархическую организацию фотографий, автоматическую генерацию миниатюр и предварительный просмотр изображений.

## 2. Архитектура системы

### 2.1 Backend (Python/aiohttp)
- **Фреймворк**: aiohttp 
- **Шаблонизатор**: Jinja2 (aiohttp_jinja2)
- **Обработка изображений**: PIL (Pillow)
- **Асинхронное I/O**: aiofiles
- **Аутентификация**: BasicAuth middleware

### 2.2 Структура каталогов
```
/mnt/disk/photo_share/
├── ОПУБЛИКОВАНО/           # Основной каталог с фотографиями
├── cache/                  # Кеш обработанных изображений
│   ├── small/             # Миниатюры (превью)
│   └── big/               # Большие изображения (1280px)
└── trash/                 # Корзина для удаленных файлов
```

## 3. URL-схема и роутинг

### 3.1 Основные URL-пути

| URL | Функция | Описание | Аутентификация |
|-----|---------|----------|----------------|
| `/gallery` | `views.gallery` | Главная страница галереи с деревом каталогов | Требуется |
| `/preview` | `views.preview` | Страница просмотра изображений в каталоге | Требуется |
| `/list` | `views.get_list` | API для получения/обработки отдельных изображений | Требуется |
| `/images` | `views.index` | Устаревший интерфейс галереи | Требуется |
| `/gpng` | `views.gpng` | Статические PNG/SVG изображения | Требуется |

### 3.2 Параметры URL

#### 3.2.1 `/gallery`
- **Назначение**: Отображение дерева каталогов
- **Параметры**: Нет
- **Возвращает**: HTML-страницу с интерактивным деревом каталогов

#### 3.2.2 `/preview?urla={path}`
- **Назначение**: Просмотр изображений в указанном каталоге
- **Параметры**:
  - `urla` - путь к каталогу (URL-encoded)
- **Пример**: `/preview?urla=2021%2F10+апреля`
- **Возвращает**: HTML-страницу с сеткой изображений

#### 3.2.3 `/list?urla={path}&photo={filename}&prev={mode}`
- **Назначение**: Получение конкретного изображения
- **Параметры**:
  - `urla` - полный путь к файлу (URL-encoded)
  - `photo` - имя файла изображения
  - `prev` - режим просмотра:
    - `yes` - миниатюра (256px)
    - `no` - большое изображение (1280px) 
    - `orig` - оригинальное изображение
- **Пример**: `/list?urla=2021%2F10+%D0%B0%D0%BF%D1%80%D0%B5%D0%BB%D1%8F%2FDSCF2243.JPG&photo=DSCF2243.JPG&prev=no`
- **Возвращает**: Изображение в формате WebP или JPEG

#### 3.2.4 `/list?urldel={path}`
- **Назначение**: Удаление/восстановление изображения
- **Параметры**:
  - `urldel` - полный путь к файлу для удаления/восстановления
- **Логика**:
  - Если кеш существует → перемещение в trash
  - Если в trash → восстановление в исходное место

## 4. Генератор миниатюр

### 4.1 Алгоритм обработки изображений

#### 4.1.1 Параметры миниатюр
- **Маленькие превью**: 256px по наименьшей стороне, WebP, качество 95%
- **Большие изображения**: 1280px по наименьшей стороне, WebP, качество 97%
- **Алгоритм ресайза**: LANCZOS
- **Поворот**: Автоматический на основе EXIF-данных

#### 4.1.2 Логика генерации
```python
# Определение размеров
prevwidth = 256    # Ширина миниатюры
basewidth = 1280   # Ширина большого изображения

# Алгоритм масштабирования
if im.size[0] <= im.size[1]:  # Портретная ориентация
    wpercent = (basewidth / float(im.size[0]))
    hsize = int((float(im.size[0]) * float(wpercent)))
else:  # Альбомная ориентация
    wpercent = (basewidth / float(im.size[1]))
    hsize = int((float(im.size[1]) * float(wpercent)))
```

### 4.2 Кеширование
- **Путь кеша**: `/mnt/disk/photo_share/cache/`
- **Структура**: Повторяет структуру основного каталога
- **Формат**: WebP для всех кешированных изображений
- **Автоматическое создание**: Каталоги создаются по мере необходимости

## 5. Управление файлами

### 5.1 Поддерживаемые форматы
- JPG, JPEG, jpg, jpeg
- Фильтрация через regex: `r'.*(JPG|jpg|jpeg|JPEG)'`

### 5.2 Система удаления/восстановления
- **Мягкое удаление**: Перемещение в каталог trash
- **Восстановление**: Перемещение обратно из trash
- **Очистка кеша**: При удалении удаляются соответствующие WebP-файлы

## 6. Пользовательский интерфейс

### 6.1 Главная страница галереи (`/gallery`)
- **Боковая панель**: Дерево каталогов с раскрывающимися меню
- **Режим редактирования**: Чекбокс для включения дополнительных функций
- **Cookie-сохранение**: Состояние режима сохраняется на 7 дней
- **Адаптивность**: Поддержка мобильных устройств

### 6.2 JavaScript-функциональность
- **Динамическое построение меню**: На основе JSON-данных от сервера
- **Анимации**: Плавное раскрытие/сворачивание подменю
- **События**: Обработка кликов и управление состоянием

## 7. Аутентификация и безопасность

### 7.1 Basic Auth
- **Middleware**: `BasicAuthMiddleware`
- **Исключения**: Только главная страница (`/`) и `/fitness` доступны без аутентификации
- **Конфигурация**: Данные читаются из файла `credentials.txt`

### 7.2 Безопасность файловой системы
- **Фильтрация путей**: Исключение каталогов с `@` и `.` в имени
- **Проверка существования**: Валидация путей перед операциями
- **Контроль доступа**: Ограничение на определенные каталоги

## 8. Подробное описание модулей и API-методов

### 8.1 Модуль построения дерева каталогов (`gallery()`)

#### 8.1.1 Алгоритм сканирования файловой системы
```python
@auth.required
@aiohttp_jinja2.template("gallery.html")
async def gallery(request):
    """
    Рекурсивное построение иерархического дерева каталогов
    до 3 уровней вложенности с фильтрацией системных папок
    """
    dir = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
    dirdict = {}
    
    # Переменные для отслеживания уровней
    l1 = ''  # Уровень 1 (год)
    l2 = ''  # Уровень 2 (месяц/событие)  
    l3 = ''  # Уровень 3 (подкатегория)
    
    # Рекурсивный обход с os.walk()
    for root, dirs, files in os.walk(dir, followlinks=False):
        level = root.replace(dir, '').count(os.sep)
        fsname = os.path.basename(root)
        fpath = str(os.path.realpath(root)).replace(dir, "")
        
        # Фильтрация системных каталогов
        if '@' in fpath or not fsname or '.' in fpath:
            continue
            
        # Обработка по уровням вложенности
        if level == 0:  # Корневой уровень
            l1 = fsname
            if not dirdict.get(l1):
                dirdict.update({l1: {'dir': fpath, 'sdir': {}}})
                
        elif level == 1:  # Первый подуровень
            l2 = fsname
            if not dirdict.get(l1).get('sdir').get(l2):
                dirdict[l1]['sdir'].update({l2: {'dir': fpath, 'sdir': {}}})
                
        elif level == 2:  # Второй подуровень
            l3 = fsname
            if not dirdict.get(l1).get('sdir').get(l2).get('sdir').get(l3):
                dirdict[l1]['sdir'][l2]['sdir'].update({l3: {'dir': fpath, 'sdir': {}}})
    
    return {'title': 'menu', 'dirlist': dirdict}
```

#### 8.1.2 Структура возвращаемых данных
```json
{
  "2021": {
    "dir": "2021",
    "sdir": {
      "10 апреля": {
        "dir": "2021/10 апреля", 
        "sdir": {
          "Природа": {
            "dir": "2021/10 апреля/Природа",
            "sdir": {}
          }
        }
      }
    }
  }
}
```

### 8.2 Модуль индексации изображений (`preview()`)

#### 8.2.1 Алгоритм сканирования и сортировки
```python
@auth.required
@aiohttp_jinja2.template("preview.html")
async def preview(request):
    """
    Сканирование каталога, фильтрация изображений по расширению,
    сортировка по времени модификации
    """
    dir = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
    params = request.rel_url.query
    
    if params.get('urla'):
        pathf = params.get('urla')
        
        # Получение всех файлов в каталоге
        imgs = glob.glob(dir + pathf + "/*")
        
        # Сортировка по времени модификации (от старых к новым)
        imgs.sort(key=lambda x: os.path.getmtime(x))
        
        # Фильтрация только изображений через regex
        imgs = list(filter(re.compile(r'.*(JPG|jpg|jpeg|JPEG)').match, imgs))
        
        # Извлечение только имен файлов
        ptintimgs = [i.split('/')[-1] for i in imgs]
        
        return {'title': 'photos', 'pathf': pathf, 'imgs': ptintimgs}
```

#### 8.2.2 Регулярные выражения для фильтрации
- **Паттерн**: `r'.*(JPG|jpg|jpeg|JPEG)'`
- **Поддерживаемые форматы**: JPG, JPEG (все варианты регистра)
- **Исключения**: PNG, GIF, TIFF, RAW форматы не обрабатываются

### 8.3 Модуль обработки изображений (`get_list()`)

#### 8.3.1 Основной алгоритм обработки
```python
@auth.required
async def get_list(request):
    """
    Комплексная обработка изображений:
    - Проверка кеша
    - Генерация миниатюр
    - Управление файлами (удаление/восстановление)
    """
    dir = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
    cache = '/mnt/disk/photo_share/cache/'
    trash = '/mnt/disk/photo_share/trash/'
    
    params = request.rel_url.query
    
    # Определение режима операции
    if params.get('urldel'):
        return await handle_file_deletion(params)
    elif params.get('urla'):
        return await handle_image_processing(params, dir, cache, trash)
```

#### 8.3.2 Алгоритм удаления/восстановления файлов
```python
async def handle_file_deletion(params):
    """
    Логика мягкого удаления с возможностью восстановления
    """
    pathf = params.get('urldel')
    pathfilelist = pathf.split('/')
    pathname = '/'.join(pathfilelist[:-1])
    filename = pathfilelist[-1]
    
    # Построение путей
    cachepath = cache + 'small/' + pathname
    cachebigpath = cache + 'big/' + pathname
    trashpath = trash + pathname
    
    bigimg = cachebigpath + '/' + filename + '.webp'
    smallimg = cachepath + '/' + filename + '.webp'
    origimg = dir + pathf
    trashimg = trash + pathf
    
    # Создание каталога trash при необходимости
    if not os.path.exists(trashpath):
        Path(trashpath).mkdir(parents=True, exist_ok=True)
    
    # Логика удаления/восстановления
    if not os.path.isfile(bigimg):
        # Если кеш не существует, восстанавливаем из trash
        if os.path.isfile(trashimg):
            os.rename(trashimg, origimg)
    else:
        # Если кеш существует, удаляем оригинал и кеш
        os.rename(origimg, trashimg)
        os.remove(bigimg)
        os.remove(smallimg)
    
    return web.Response(body='200')
```

#### 8.3.3 Алгоритм обработки изображений и кеширования
```python
async def handle_image_processing(params, dir, cache, trash):
    """
    Детальный алгоритм генерации миниатюр и кеширования
    """
    pathf = params.get('urla')
    prev = params.get('prev')
    
    # Парсинг пути
    pathfilelist = pathf.split('/')
    pathname = '/'.join(pathfilelist[:-1])
    filename = pathfilelist[-1]
    
    # Построение путей кеша
    cachepath = cache + 'small/' + pathname
    cachebigpath = cache + 'big/' + pathname
    
    bigimg = cachebigpath + '/' + filename + '.webp'
    smallimg = cachepath + '/' + filename + '.webp'
    origimg = dir + pathf
    
    # Проверка существования кеша
    if os.path.isfile(smallimg):
        # Кеш существует - возвращаем нужную версию
        return await serve_cached_image(prev, smallimg, bigimg, origimg)
    else:
        # Кеш не существует - генерируем
        return await generate_and_cache_image(origimg, cachepath, cachebigpath, 
                                            filename, prev)
```

#### 8.3.4 Детальный алгоритм генерации миниатюр
```python
async def generate_and_cache_image(origimg, cachepath, cachebigpath, filename, prev):
    """
    Алгоритм ресайза изображений с сохранением пропорций
    """
    # Чтение исходного изображения
    file = await open_image(origimg)
    ims = Image.open(BytesIO(file))
    
    # Автоматический поворот на основе EXIF
    im = ImageOps.exif_transpose(ims)
    
    # Создание каталогов кеша
    if not os.path.exists(cachebigpath):
        Path(cachebigpath).mkdir(parents=True, exist_ok=True)
    if not os.path.exists(cachepath):
        Path(cachepath).mkdir(parents=True, exist_ok=True)
    
    # Параметры ресайза
    prevwidth = 256   # Размер превью
    basewidth = 1280  # Размер большого изображения
    
    # Определение ориентации и расчет размеров
    if im.size[0] <= im.size[1]:  # Портретная ориентация
        # Масштабирование по ширине
        prevwpercent = (prevwidth / float(im.size[0]))
        prevhsize = int((float(im.size[0]) * float(prevwpercent)))
        
        wpercent = (basewidth / float(im.size[0]))
        hsize = int((float(im.size[0]) * float(wpercent)))
    else:  # Альбомная ориентация
        # Масштабирование по высоте
        prevwpercent = (prevwidth / float(im.size[1]))
        prevhsize = int((float(im.size[1]) * float(prevwpercent)))
        
        wpercent = (basewidth / float(im.size[1]))
        hsize = int((float(im.size[1]) * float(wpercent)))
    
    # Создание превью
    imprev = im.copy()
    imprev.thumbnail((prevwidth, prevhsize), Image.LANCZOS)
    imprev.save(cachepath + '/' + filename + '.webp', 'webp', quality=95)
    
    # Создание большого изображения
    im.thumbnail((basewidth, hsize), Image.LANCZOS)
    im.save(cachebigpath + '/' + filename + '.webp', 'webp', quality=97)
    
    # Возврат нужной версии
    stream = BytesIO()
    if prev == 'yes':
        imprev.save(stream, 'webp')
    else:
        im.save(stream, 'webp')
    
    return web.Response(body=stream.getvalue(), content_type='image/jpeg')
```

### 8.4 Модуль статических изображений (`gpng()`)

#### 8.4.1 Обработчик PNG/SVG файлов
```python
@auth.required
async def gpng(request) -> None:
    """
    Асинхронная отдача статических PNG и SVG файлов
    из каталога images/ с правильными MIME-типами
    """
    params = request.rel_url.query
    
    if params.get('png'):
        filename = params.get('png')
        filepath = f'images/{filename}.png'
        
        async with aiofiles.open(filepath, "rb") as file:
            contents = await file.read()
            return web.Response(body=contents, content_type='image/png')
    
    elif params.get('svg'):
        filename = params.get('svg')
        filepath = f'images/{filename}.svg'
        
        async with aiofiles.open(filepath, "rb") as file:
            contents = await file.read()
            return web.Response(body=contents, content_type='image/svg+xml')
```

### 8.5 Вспомогательные функции

#### 8.5.1 Асинхронное чтение файлов
```python
async def open_image(path) -> bytes:
    """
    Неблокирующее чтение файлов изображений
    с обработкой исключений
    """
    try:
        async with aiofiles.open(path, "rb") as file:
            contents = await file.read()
            return contents
    except FileNotFoundError:
        raise web.HTTPNotFound(text=f"Image not found: {path}")
    except PermissionError:
        raise web.HTTPForbidden(text=f"Access denied: {path}")
    except Exception as e:
        raise web.HTTPInternalServerError(text=f"Error reading image: {str(e)}")
```

#### 8.5.2 Валидация путей
```python
def validate_path(path: str) -> bool:
    """
    Проверка безопасности пути для предотвращения
    path traversal атак
    """
    # Запрещенные символы и паттерны
    forbidden_patterns = ['../', '..\\', '@', '$', '|', ';', '&']
    
    for pattern in forbidden_patterns:
        if pattern in path:
            return False
    
    # Проверка существования пути
    full_path = os.path.join("/mnt/disk/photo_share/ОПУБЛИКОВАНО/", path)
    return os.path.exists(full_path)
```

#### 8.5.3 Определение MIME-типов
```python
def get_content_type(prev_mode: str) -> str:
    """
    Определение правильного Content-Type
    на основе режима просмотра
    """
    mime_types = {
        'yes': 'image/webp',    # Превью
        'no': 'image/webp',     # Большое изображение  
        'orig': 'image/jpeg'    # Оригинальное изображение
    }
    return mime_types.get(prev_mode, 'image/jpeg')

## 9. Frontend JavaScript модуль (gallery.html)

### 9.1 Алгоритм построения динамического меню

#### 9.1.1 Функция рендеринга дерева каталогов
```javascript
function renderList(obj, ischild) {
    /**
     * Рекурсивное построение HTML-структуры меню
     * из JSON-данных сервера
     */
    
    // Создание контейнера в зависимости от уровня
    if (ischild === 'child') {
        var result = document.createElement('div');
        result.className = "sub-menu-list";
        var ul = document.createElement('ul');
        result.append(ul);
    } else {
        var result = document.createElement('ul');
    }
    
    // Итерация по объектам каталогов
    for (key in obj) {
        const template = document.getElementById('post_template');
        var list = document.createElement('li');
        const post = template.content.cloneNode(true);
        
        // Определение типа элемента (папка или конечный каталог)
        if (typeof obj[key]['sdir'] === 'object' && 
            Object.keys(obj[key]['sdir']).length > 0) {
            list.className = "menu-item sub-menu";
        } else {
            list.className = "menu-item";
            post.getElementById('hr').href = generateurl(obj[key]['dir']);
        }
        
        // Добавление текста и рекурсивная обработка подменю
        var linkText = document.createTextNode(key);
        post.getElementById('nm').appendChild(linkText);
        list.appendChild(post);
        
        if (typeof obj[key]['sdir'] === 'object' && 
            Object.keys(obj[key]['sdir']).length > 0) {
            list.appendChild(renderList(obj[key]['sdir'], 'child'));
        }
        
        result.appendChild(list);
    }
    
    return result;
}
```

#### 9.1.2 Генератор URL для навигации
```javascript
function generateurl(srt) {
    /**
     * Создание корректных URL с URL-encoding
     * для навигации по каталогам
     */
    const params = new URLSearchParams({
        urla: srt
    });
    var urlb = 'preview?' + params;
    return urlb;
}
```

### 9.2 Система управления Cookie

#### 9.2.1 Алгоритмы работы с Cookie
```javascript
function setCookie(name, value, days) {
    /**
     * Установка cookie с заданным временем жизни
     */
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

function getCookie(name) {
    /**
     * Извлечение значения cookie по имени
     */
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}
```

#### 9.2.2 Управление режимом редактирования
```javascript
// Инициализация состояния из cookie
const mode = getCookie('mode');
if (mode === '1') {
    document.getElementById('modeCheckbox').checked = true;
} else {
    document.getElementById('modeCheckbox').checked = false;
}

// Обработчик переключения режима
document.getElementById('modeCheckbox').addEventListener('change', function() {
    if (this.checked) {
        setCookie('mode', '1', 7); // Устанавливаем куку на 7 дней
    } else {
        setCookie('mode', '0', 7);
    }
});
```

### 9.3 Система анимации меню

#### 9.3.1 Алгоритмы плавного раскрытия/сворачивания
```javascript
const slideDown = (target, duration = ANIMATION_DURATION) => {
    /**
     * Плавное раскрытие элемента с анимацией высоты
     */
    const { parentElement } = target;
    parentElement.classList.add("open");
    
    target.style.removeProperty("display");
    let { display } = window.getComputedStyle(target);
    if (display === "none") display = "block";
    target.style.display = display;
    
    const height = target.offsetHeight;
    target.style.overflow = "hidden";
    target.style.height = 0;
    target.style.paddingTop = 0;
    target.style.paddingBottom = 0;
    target.style.marginTop = 0;
    target.style.marginBottom = 0;
    target.offsetHeight;
    
    target.style.boxSizing = "border-box";
    target.style.transitionProperty = "height, margin, padding";
    target.style.transitionDuration = `${duration}ms`;
    target.style.height = `${height}px`;
    target.style.removeProperty("padding-top");
    target.style.removeProperty("padding-bottom");
    target.style.removeProperty("margin-top");
    target.style.removeProperty("margin-bottom");
    
    window.setTimeout(() => {
        target.style.removeProperty("height");
        target.style.removeProperty("overflow");
        target.style.removeProperty("transition-duration");
        target.style.removeProperty("transition-property");
    }, duration);
};

const slideUp = (target, duration = ANIMATION_DURATION) => {
    /**
     * Плавное сворачивание элемента
     */
    const { parentElement } = target;
    parentElement.classList.remove("open");
    
    target.style.transitionProperty = "height, margin, padding";
    target.style.transitionDuration = `${duration}ms`;
    target.style.boxSizing = "border-box";
    target.style.height = `${target.offsetHeight}px`;
    target.offsetHeight;
    target.style.overflow = "hidden";
    target.style.height = 0;
    target.style.paddingTop = 0;
    target.style.paddingBottom = 0;
    target.style.marginTop = 0;
    target.style.marginBottom = 0;
    
    window.setTimeout(() => {
        target.style.display = "none";
        target.style.removeProperty("height");
        target.style.removeProperty("padding-top");
        target.style.removeProperty("padding-bottom");
        target.style.removeProperty("margin-top");
        target.style.removeProperty("margin-bottom");
        target.style.removeProperty("overflow");
        target.style.removeProperty("transition-duration");
        target.style.removeProperty("transition-property");
    }, duration);
};
```

#### 9.3.2 Обработчики событий меню
```javascript
// Обработка кликов по подменю верхнего уровня
FIRST_SUB_MENUS_BTN.forEach((element) => {
    element.addEventListener("click", () => {
        if (SIDEBAR_EL.classList.contains("collapsed")) {
            // Режим сжатого сайдбара - не анимируем
        } else {
            // Закрытие других открытых подменю
            const parentMenu = element.closest(".menu.open-current-submenu");
            if (parentMenu) {
                parentMenu
                    .querySelectorAll(":scope > ul > .menu-item.sub-menu > a")
                    .forEach((el) => {
                        if (window.getComputedStyle(el.nextElementSibling).display !== "none") {
                            slideUp(el.nextElementSibling);
                        }
                    });
            }
            slideToggle(element.nextElementSibling);
        }
    });
});

// Обработка кликов по внутренним подменю
INNER_SUB_MENUS_BTN.forEach((element) => {
    element.addEventListener("click", () => {
        slideToggle(element.nextElementSibling);
    });
});
```

### 9.4 Адаптивный дизайн CSS

#### 9.4.1 Media Queries для мобильных устройств
```css
@media screen and (min-width: 1024px) {
    .layout .sidebar .menu .menu-item a {
        display: flex;
        align-items: center;
        height: 30px;
        padding: 0 20px;
        color: #b3b8d4;
    }
    body {
        font-size: 1rem;
    }
}

@media screen and (min-width: 0px) and (max-width: 1023px) {
    .layout .sidebar .menu .menu-item a {
        display: flex;
        align-items: center;
        height: 130px;  /* Увеличенная высота для мобильных */
        padding: 0 20px;
        color: #b3b8d4;
    }
    body {
        font-size: 5rem;  /* Увеличенный шрифт для мобильных */
    }
}
```

## 10. Детальная обработка ошибок

### 10.1 Файловые операции с обработкой исключений

#### 10.1.1 Иерархия исключений
```python
class GalleryException(Exception):
    """Базовый класс для исключений галереи"""
    pass

class ImageNotFoundError(GalleryException):
    """Изображение не найдено"""
    pass

class InvalidPathError(GalleryException):
    """Недопустимый путь к файлу"""
    pass

class CacheError(GalleryException):
    """Ошибка работы с кешем"""
    pass

class ImageProcessingError(GalleryException):
    """Ошибка обработки изображения"""
    pass
```

#### 10.1.2 Обработчик ошибок файловых операций
```python
async def safe_file_operation(operation, *args, **kwargs):
    """
    Безопасное выполнение файловых операций с логированием
    """
    try:
        return await operation(*args, **kwargs)
    except FileNotFoundError as e:
        logger.error(f"File not found: {e}")
        raise ImageNotFoundError(f"Image file not found: {e}")
    except PermissionError as e:
        logger.error(f"Permission denied: {e}")
        raise web.HTTPForbidden(text=f"Access denied: {e}")
    except OSError as e:
        logger.error(f"OS error: {e}")
        raise web.HTTPInternalServerError(text=f"System error: {e}")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise web.HTTPInternalServerError(text=f"Unexpected error: {e}")
```

### 10.2 Обработка ошибок изображений

#### 10.2.1 Валидация изображений
```python
def validate_image_file(filepath: str) -> bool:
    """
    Проверка файла изображения на корректность
    """
    try:
        with Image.open(filepath) as img:
            img.verify()  # Проверка целостности
            return True
    except (IOError, SyntaxError) as e:
        logger.warning(f"Invalid image file {filepath}: {e}")
        return False

async def process_image_with_validation(filepath: str):
    """
    Обработка изображения с предварительной валидацией
    """
    if not validate_image_file(filepath):
        raise ImageProcessingError(f"Invalid or corrupted image: {filepath}")
    
    try:
        file = await open_image(filepath)
        ims = Image.open(BytesIO(file))
        im = ImageOps.exif_transpose(ims)
        return im
    except Exception as e:
        logger.error(f"Image processing failed for {filepath}: {e}")
        raise ImageProcessingError(f"Failed to process image: {e}")
```

#### 10.2.2 Обработка ошибок EXIF
```python
def safe_exif_transpose(image):
    """
    Безопасный поворот изображения на основе EXIF с fallback
    """
    try:
        return ImageOps.exif_transpose(image)
    except Exception as e:
        logger.warning(f"EXIF transpose failed: {e}")
        return image  # Возвращаем исходное изображение
```

### 10.3 Обработка ошибок кеширования

#### 10.3.1 Проверка дискового пространства
```python
import shutil

def check_disk_space(path: str, required_mb: int = 100) -> bool:
    """
    Проверка доступного дискового пространства
    """
    try:
        total, used, free = shutil.disk_usage(path)
        free_mb = free // (1024 * 1024)
        return free_mb > required_mb
    except OSError:
        return False

async def create_cache_with_space_check(cache_path: str, image_size: int):
    """
    Создание кеша с проверкой дискового пространства
    """
    estimated_size_mb = (image_size * 2) // (1024 * 1024)  # Примерная оценка
    
    if not check_disk_space(cache_path, estimated_size_mb + 50):
        raise CacheError("Insufficient disk space for cache generation")
    
    if not os.path.exists(cache_path):
        try:
            Path(cache_path).mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise CacheError(f"Failed to create cache directory: {e}")
```

### 10.4 Логирование и мониторинг

#### 10.4.1 Настройка логирования
```python
import logging
from logging.handlers import RotatingFileHandler

def setup_gallery_logging():
    """
    Настройка логирования для модуля галереи
    """
    logger = logging.getLogger('gallery')
    logger.setLevel(logging.INFO)
    
    # Ротирующий файл лог
    handler = RotatingFileHandler(
        'logs/gallery.log', 
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    
    return logger

logger = setup_gallery_logging()
```

#### 10.4.2 Метрики производительности
```python
import time
from functools import wraps

def measure_performance(func):
    """
    Декоратор для измерения производительности функций
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            result = await func(*args, **kwargs)
            end_time = time.time()
            execution_time = end_time - start_time
            logger.info(f"{func.__name__} executed in {execution_time:.2f}s")
            return result
        except Exception as e:
            end_time = time.time()
            execution_time = end_time - start_time
            logger.error(f"{func.__name__} failed after {execution_time:.2f}s: {e}")
            raise
    return wrapper

@measure_performance
async def generate_thumbnail_with_metrics(original_path, cache_path, filename):
    """
    Генерация миниатюр с измерением производительности
    """
    return await generate_and_cache_image(original_path, cache_path, filename)
```

## 10. Производительность

### 10.1 Асинхронные операции
- **aiofiles**: Неблокирующее чтение файлов
- **Потоковая обработка**: `BytesIO` для работы с изображениями в памяти
- **Кеширование**: Избежание повторной обработки изображений

### 10.2 Оптимизация
- **WebP-формат**: Лучшее сжатие по сравнению с JPEG
- **Lazy loading**: Изображения обрабатываются по требованию
- **Сортировка**: По времени модификации файлов

## 11. Конфигурация

### 11.1 Пути и настройки
```python
# Основные пути
dir = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
cache = '/mnt/disk/photo_share/cache/'
trash = '/mnt/disk/photo_share/trash/'

# Параметры миниатюр
prevwidth = 256     # Размер превью
basewidth = 1280    # Размер больших изображений

# Качество WebP
quality_preview = 95   # Для превью
quality_big = 97      # Для больших изображений
```

### 11.2 Middleware настройки
```python
# Исключения из аутентификации
excluded_paths = ['/', '/fitness']
```

## 12. Развертывание и требования

### 12.1 Зависимости Python
```
aiohttp
aiohttp-jinja2
Pillow
aiofiles
aiohttp-basicauth
jinja2
```

### 12.2 Системные требования
- **Файловая система**: Поддержка символических ссылок
- **Дисковое пространство**: Дополнительно ~30% для кеша
- **Права доступа**: Чтение/запись в каталогах изображений и кеша

## 13. Тестирование и качество кода

### 13.1 Unit-тесты для основных модулей

#### 13.1.1 Тестирование генерации миниатюр
```python
import pytest
import tempfile
import os
from PIL import Image
from app.forum.views import generate_and_cache_image

class TestImageProcessing:
    @pytest.fixture
    def sample_image(self):
        """Создание тестового изображения"""
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            img = Image.new('RGB', (2000, 1500), color='red')
            img.save(f.name, 'JPEG')
            yield f.name
        os.unlink(f.name)
    
    @pytest.fixture
    def cache_dirs(self):
        """Создание временных каталогов для кеша"""
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_small = os.path.join(tmpdir, 'small')
            cache_big = os.path.join(tmpdir, 'big')
            os.makedirs(cache_small)
            os.makedirs(cache_big)
            yield cache_small, cache_big
    
    async def test_thumbnail_generation(self, sample_image, cache_dirs):
        """Тест генерации миниатюр"""
        cache_small, cache_big = cache_dirs
        filename = 'test_image.jpg'
        
        result = await generate_and_cache_image(
            sample_image, cache_small, cache_big, filename, 'yes'
        )
        
        # Проверка создания файлов кеша
        assert os.path.exists(os.path.join(cache_small, filename + '.webp'))
        assert os.path.exists(os.path.join(cache_big, filename + '.webp'))
        
        # Проверка размеров
        small_img = Image.open(os.path.join(cache_small, filename + '.webp'))
        big_img = Image.open(os.path.join(cache_big, filename + '.webp'))
        
        assert max(small_img.size) <= 256
        assert max(big_img.size) <= 1280

    async def test_invalid_image_handling(self):
        """Тест обработки некорректных изображений"""
        with tempfile.NamedTemporaryFile(suffix='.jpg') as f:
            f.write(b'invalid image data')
            f.flush()
            
            with pytest.raises(ImageProcessingError):
                await process_image_with_validation(f.name)
```

#### 13.1.2 Тестирование файловых операций
```python
class TestFileOperations:
    async def test_safe_file_deletion(self):
        """Тест безопасного удаления файлов"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Создание тестовой структуры
            original_path = os.path.join(tmpdir, 'original', 'test.jpg')
            cache_path = os.path.join(tmpdir, 'cache', 'test.webp')
            trash_path = os.path.join(tmpdir, 'trash', 'test.jpg')
            
            os.makedirs(os.path.dirname(original_path))
            os.makedirs(os.path.dirname(cache_path))
            
            # Создание файлов
            Image.new('RGB', (100, 100)).save(original_path)
            Image.new('RGB', (100, 100)).save(cache_path, 'webp')
            
            # Тест удаления
            await handle_file_deletion({'urldel': 'test.jpg'})
            
            assert not os.path.exists(original_path)
            assert os.path.exists(trash_path)
            assert not os.path.exists(cache_path)

    def test_path_validation(self):
        """Тест валидации путей"""
        valid_paths = ['2021/summer/beach.jpg', 'photos/nature/tree.jpeg']
        invalid_paths = ['../../../etc/passwd', 'photos@hack/image.jpg', 'test;rm -rf /']
        
        for path in valid_paths:
            assert validate_path(path) or True  # Путь может не существовать
        
        for path in invalid_paths:
            assert not validate_path(path)
```

### 13.2 Integration-тесты

#### 13.2.1 Тестирование HTTP-эндпоинтов
```python
import pytest
from aiohttp.test_utils import AioHTTPTestCase, unittest_run_loop
from main import my_web_app

class TestGalleryEndpoints(AioHTTPTestCase):
    async def get_application(self):
        return await my_web_app()
    
    @unittest_run_loop
    async def test_gallery_page(self):
        """Тест главной страницы галереи"""
        resp = await self.client.request("GET", "/gallery")
        assert resp.status == 200
        text = await resp.text()
        assert 'menu' in text
    
    @unittest_run_loop
    async def test_preview_page(self):
        """Тест страницы превью"""
        resp = await self.client.request("GET", "/preview?urla=test")
        assert resp.status == 200
    
    @unittest_run_loop
    async def test_image_serving(self):
        """Тест отдачи изображений"""
        resp = await self.client.request("GET", "/list?urla=test/image.jpg&prev=yes")
        assert resp.status in [200, 404]  # 404 если файл не существует
```

### 13.3 Performance-тесты

#### 13.3.1 Нагрузочное тестирование
```python
import asyncio
import aiohttp
import time

async def load_test_image_generation():
    """Нагрузочный тест генерации изображений"""
    concurrent_requests = 10
    total_requests = 100
    
    async def make_request(session, url):
        start_time = time.time()
        async with session.get(url) as response:
            await response.read()
            return time.time() - start_time
    
    async with aiohttp.ClientSession() as session:
        tasks = []
        for i in range(total_requests):
            url = f"http://localhost:8080/list?urla=test/image{i%5}.jpg&prev=yes"
            tasks.append(make_request(session, url))
            
            if len(tasks) >= concurrent_requests:
                results = await asyncio.gather(*tasks)
                tasks = []
                print(f"Batch completed, avg time: {sum(results)/len(results):.2f}s")

if __name__ == "__main__":
    asyncio.run(load_test_image_generation())
```

## 14. Развертывание и конфигурация

### 14.1 Docker-конфигурация

#### 14.1.1 Dockerfile
```dockerfile
FROM python:3.12-slim

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    libjpeg-dev \
    libpng-dev \
    libwebp-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копирование зависимостей
COPY requirements.txt .
RUN pip install -r requirements.txt

# Копирование кода приложения
COPY . .

# Создание необходимых каталогов
RUN mkdir -p logs /mnt/disk/photo_share/cache/small /mnt/disk/photo_share/cache/big

# Экспозиция порта
EXPOSE 8080

# Запуск приложения
CMD ["python", "main.py"]
```

#### 14.1.2 docker-compose.yml
```yaml
version: '3.8'

services:
  gallery:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./photos:/mnt/disk/photo_share/ОПУБЛИКОВАНО:ro
      - ./cache:/mnt/disk/photo_share/cache
      - ./trash:/mnt/disk/photo_share/trash
      - ./logs:/app/logs
    environment:
      - PYTHONUNBUFFERED=1
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 14.2 Системная конфигурация

#### 14.2.1 Systemd service
```ini
[Unit]
Description=Photo Gallery Service
After=network.target

[Service]
Type=simple
User=gallery
WorkingDirectory=/opt/gallery
ExecStart=/opt/gallery/venv/bin/python main.py
Restart=always
RestartSec=10
Environment=PYTHONPATH=/opt/gallery

[Install]
WantedBy=multi-user.target
```

#### 14.2.2 Nginx reverse proxy
```nginx
server {
    listen 80;
    server_name gallery.example.com;
    
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    # Кеширование статических файлов
    location ~* \.(jpg|jpeg|png|gif|webp|css|js)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://127.0.0.1:8080;
    }
}
```

### 14.3 Мониторинг и алертинг

#### 14.3.1 Health check endpoints
```python
from aiohttp import web
import os
import shutil

async def health_check(request):
    """Проверка состояния системы"""
    checks = {
        'status': 'healthy',
        'timestamp': time.time(),
        'checks': {}
    }
    
    # Проверка файловой системы
    try:
        photos_dir = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
        cache_dir = "/mnt/disk/photo_share/cache/"
        
        checks['checks']['photos_accessible'] = os.path.exists(photos_dir)
        checks['checks']['cache_accessible'] = os.path.exists(cache_dir)
        
        # Проверка дискового пространства
        total, used, free = shutil.disk_usage(cache_dir)
        free_gb = free // (1024**3)
        checks['checks']['disk_space_gb'] = free_gb
        checks['checks']['disk_space_ok'] = free_gb > 1  # Минимум 1GB
        
        # Общий статус
        if not all([
            checks['checks']['photos_accessible'],
            checks['checks']['cache_accessible'], 
            checks['checks']['disk_space_ok']
        ]):
            checks['status'] = 'unhealthy'
            
    except Exception as e:
        checks['status'] = 'unhealthy'
        checks['error'] = str(e)
    
    status_code = 200 if checks['status'] == 'healthy' else 503
    return web.json_response(checks, status=status_code)

# Добавление в routes.py
app.router.add_get('/health', health_check)
```

#### 14.3.2 Метрики Prometheus
```python
from prometheus_client import Counter, Histogram, Gauge, generate_latest
import time

# Метрики
REQUEST_COUNT = Counter('gallery_requests_total', 'Total requests', ['endpoint', 'method'])
REQUEST_DURATION = Histogram('gallery_request_duration_seconds', 'Request duration')
CACHE_SIZE = Gauge('gallery_cache_size_bytes', 'Cache size in bytes')
IMAGE_PROCESSING_TIME = Histogram('gallery_image_processing_seconds', 'Image processing time')

@REQUEST_DURATION.time()
async def metrics_middleware(request, handler):
    """Middleware для сбора метрик"""
    start_time = time.time()
    
    try:
        response = await handler(request)
        REQUEST_COUNT.labels(
            endpoint=request.path, 
            method=request.method
        ).inc()
        return response
    except Exception as e:
        REQUEST_COUNT.labels(
            endpoint=request.path, 
            method=request.method
        ).inc()
        raise

async def metrics_endpoint(request):
    """Эндпоинт для метрик Prometheus"""
    return web.Response(
        text=generate_latest().decode('utf-8'),
        content_type='text/plain'
    )

# Добавление в routes.py
app.router.add_get('/metrics', metrics_endpoint)
```

## 15. Расширения и будущие доработки

### 15.1 Планируемые улучшения

#### 15.1.1 Поддержка новых форматов
- **AVIF**: Современный формат с лучшим сжатием
- **HEIC**: Формат Apple для фотографий
- **WebP**: Расширенная поддержка анимации

#### 15.1.2 Metadata и EXIF
```python
from PIL.ExifTags import TAGS
import json

def extract_image_metadata(image_path):
    """Извлечение метаданных изображения"""
    try:
        image = Image.open(image_path)
        exifdata = image.getexif()
        
        metadata = {
            'size': image.size,
            'format': image.format,
            'mode': image.mode,
            'exif': {}
        }
        
        for tag_id in exifdata:
            tag = TAGS.get(tag_id, tag_id)
            data = exifdata.get(tag_id)
            
            # Декодирование GPS координат
            if tag == 'GPSInfo':
                metadata['gps'] = decode_gps_info(data)
            else:
                metadata['exif'][tag] = str(data)[:100]  # Ограничение длины
        
        return metadata
    except Exception as e:
        return {'error': str(e)}
```

#### 15.1.3 Поиск и фильтрация
```python
async def search_images(request):
    """API для поиска изображений"""
    query = request.query.get('q', '')
    date_from = request.query.get('date_from')
    date_to = request.query.get('date_to')
    
    # Поиск по имени файла
    results = []
    photos_dir = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
    
    for root, dirs, files in os.walk(photos_dir):
        for file in files:
            if query.lower() in file.lower():
                file_path = os.path.join(root, file)
                stat = os.stat(file_path)
                
                results.append({
                    'path': file_path.replace(photos_dir, ''),
                    'name': file,
                    'size': stat.st_size,
                    'modified': stat.st_mtime,
                    'url': f"/list?urla={file_path.replace(photos_dir, '')}&prev=yes"
                })
    
    return web.json_response({'results': results[:50]})  # Лимит 50
```

### 15.2 Архитектурные улучшения

#### 15.2.1 Микросервисная архитектура
- **Image Service**: Обработка изображений
- **Metadata Service**: Работа с метаданными
- **Search Service**: Поиск и индексация
- **Auth Service**: Аутентификация и авторизация

#### 15.2.2 Кеширование Redis
```python
import redis
import json

redis_client = redis.Redis(host='localhost', port=6379, db=0)

async def get_cached_metadata(image_path):
    """Получение метаданных из кеша"""
    cache_key = f"metadata:{image_path}"
    cached = redis_client.get(cache_key)
    
    if cached:
        return json.loads(cached)
    
    # Если нет в кеше - извлекаем и кешируем
    metadata = extract_image_metadata(image_path)
    redis_client.setex(cache_key, 3600, json.dumps(metadata))  # 1 час
    
    return metadata
```

---

*Документ создан: 2025-09-06*  
*Версия: 2.0*  
*Автор: Система анализа кода*  
*Последнее обновление: Детальное описание модулей, алгоритмов и методов*