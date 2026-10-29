"""RSS edition selection describes retrieval context, not publisher nationality."""
REGIONS = {
    'TW': {'name':'台灣','language':'zh-TW','ceid':'TW:zh-Hant','sites':['tw.news.yahoo.com']},
    'US': {'name':'美國','language':'en-US','ceid':'US:en','sites':['news.yahoo.com','finance.yahoo.com']},
    'HK': {'name':'香港','language':'zh-HK','ceid':'HK:zh-Hant','sites':['hk.news.yahoo.com']},
    'JP': {'name':'日本','language':'ja','ceid':'JP:ja','sites':['news.yahoo.co.jp']},
    'GB': {'name':'英國','language':'en-GB','ceid':'GB:en','sites':['uk.news.yahoo.com']},
}

def validate_region(value):
    if value is not None and (not isinstance(value,str) or value not in REGIONS):
        raise ValueError('不支援的 RSS 國家／地區')
    return value

def edition(provider,region=None):
    validate_region(region)
    country=region or ('US' if provider=='yahoo' else 'TW')
    spec=REGIONS[country]
    sites=['finance.yahoo.com'] if region is None and provider=='yahoo' else spec['sites']
    return {'country':country,'language':spec['language'],'ceid':spec['ceid'],'sites':sites if provider=='yahoo' else []}
