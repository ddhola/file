import { Crypto, _ } from 'assets://js/lib/cat.js';

let siteUrl = 'https://www.4k-av.com';
let headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148',
    'Referer': siteUrl
};

let homeVods = [];

async function request(reqUrl) {
    let res = await req(reqUrl, {
        method: 'get',
        headers: headers,
        timeout: 30000,
    });
    return res.content;
}

async function init(cfg) {
    if (cfg.ext) {
        siteUrl = cfg.ext;
    }
}

async function home(filter) {
    try {
        let html = await request(siteUrl);
        
        // Parse specific categories (only TV and Movie)
        let categoryRegex = /<div id="category">[\s\S]*?<ul id="cate_list">([\s\S]*?)<\/ul>/;
        let categoryMatch = html.match(categoryRegex);
        let categories = [];
        
        if (categoryMatch) {
            let categoryHtml = categoryMatch[1];
            let tvMatch = categoryHtml.match(/<li><a href="(\/tv\/)"[^>]*>电视剧<\/a><\/li>/);
            let movieMatch = categoryHtml.match(/<li><a href="(\/movie\/)"[^>]*>电影<\/a><\/li>/);
            
            if (tvMatch) {
                categories.push({
                    type_id: tvMatch[1],
                    type_name: '电视剧'
                });
            }
            
            if (movieMatch) {
                categories.push({
                    type_id: movieMatch[1],
                    type_name: '电影'
                });
            }
        }
        
        // Parse home videos from NTMitem divs
        let videos = await parseNTMItems(html);
        homeVods = videos;
        
        return JSON.stringify({
            class: categories,
            filters: {}
        });
    } catch (e) {
        return JSON.stringify({
            class: [],
            filters: {}
        });
    }
}

async function homeVod() {
    if (homeVods.length === 0) {
        await home();
    }
    return JSON.stringify({
        list: homeVods
    });
}

async function category(tid, pg, filter, extend) {
    try {
        // First determine if this is the initial page load
        const isInitialLoad = pg === '1' || pg === 1;
        
        let url, html;
        
        if (isInitialLoad) {
            // For initial load, request without page number to get first page and total count
            url = tid.startsWith('http') ? tid : `${siteUrl}/${tid.replace(/^\//, '')}`;
            // Ensure URL doesn't end with .html (some sites handle both formats)
            url = url.replace(/\.html$/, '');
            html = await request(url);
            
            // Try to find pagination info
            const pageInfoMatch = html.match(/<span class="page-number">页次 \d+\/(\d+)<\/span>/);
            const totalPages = pageInfoMatch ? parseInt(pageInfoMatch[1]) : 1;
            
            // Store total pages for future requests
            const list = await parseNTMItems(html);
            
            return JSON.stringify({
                page: 1,
                pagecount: totalPages,
                limit: 90,
                total: 999999,
                list: list
            });
        } else {
            // For subsequent pages, we need to get total pages first
            const initialUrl = tid.startsWith('http') ? tid : `${siteUrl}/${tid.replace(/^\//, '')}`;
            const initialHtml = await request(initialUrl.replace(/\.html$/, ''));
            const pageInfoMatch = initialHtml.match(/<span class="page-number">页次 \d+\/(\d+)<\/span>/);
            const totalPages = pageInfoMatch ? parseInt(pageInfoMatch[1]) : 1;
            
            // Calculate reverse page number
            const reversePg = totalPages - parseInt(pg) + 1;
            
            // Build URL for reverse page
            if (reversePg === 1) {
                // If reverse page is 1, use the initial URL without page number
                url = initialUrl;
            } else {
                // Otherwise use the page number format
                url = tid.startsWith('http') ? 
                    `${tid.replace(/\/$/, '')}/page-${reversePg}.html` : 
                    `${siteUrl}/${tid.replace(/^\//, '').replace(/\/$/, '')}/page-${reversePg}.html`;
            }
            
            html = await request(url);
            const list = await parseNTMItems(html);
            
            return JSON.stringify({
                page: parseInt(pg),
                pagecount: totalPages,
                limit: 90,
                total: 999999,
                list: list
            });
        }
    } catch (e) {
        console.error("Category error:", e);
        return JSON.stringify({
            page: 1,
            pagecount: 1,
            limit: 90,
            total: 0,
            list: []
        });
    }
}

async function parseNTMItems(html) {
    let list = [];
    // 改进后的正则表达式，匹配整个NTMitem区块
    let itemRegex = /<div class="NTMitem">([\s\S]*?<\/div>\s*<\/div>\s*<\/div>)/g;
    
    let match;
    while ((match = itemRegex.exec(html)) !== null) {
        let itemHtml = match[1];
        
        // 1. 提取基础信息
        let titleMatch = itemHtml.match(/<h2>(.*?)<\/h2>/);
        let linkMatch = itemHtml.match(/<a[^>]*href="([^"]*)"[^>]*title="[^"]*"/);
        
        // 2. 提取副标题
        let subTitleMatch = itemHtml.match(/<h3>(.*?)<\/h3>/);
        
        // 3. 提取图片（三种方式）
        let posterMatch = itemHtml.match(/<div class="poster">[\s\S]*?<img[^>]*src="([^"]*)"/);
        if (!posterMatch) {
            posterMatch = itemHtml.match(/<img[^>]*src="([^"]*)"[^>]*alt="[^"]*海报/);
        }
        if (!posterMatch && linkMatch) {
            // 构造默认海报路径
            let path = linkMatch[1].replace(/^\//, '').replace(/\/$/, '');
            posterMatch = [`${siteUrl}/${path}/poster_nail.jpg`];
        }
        
        // 4. 提取其他信息
        let yearMatch = itemHtml.match(/<label[^>]*title="年份"[^>]*>(.*?)<\/label>/);
        let resMatch = itemHtml.match(/<label[^>]*title="分辨率"[^>]*>(.*?)<\/label>/);
        let tagsMatch = itemHtml.match(/<div class="tags">[\s\S]*?<span>(.*?)<\/span>/g);
        
        // 构建视频对象
        let vod = {
            vod_id: linkMatch ? linkMatch[1] : '',
            vod_name: titleMatch ? titleMatch[1].trim() : '',
            vod_subtitle: subTitleMatch ? subTitleMatch[1].trim() : '',
            vod_pic: posterMatch ? posterMatch[1] : '',
            vod_remarks: (yearMatch ? yearMatch[1].trim() : '') + 
                        (resMatch ? ' | ' + resMatch[1].trim() : ''),
            vod_tag: tagsMatch ? tagsMatch.map(t => t.replace(/<[^>]*>/g, '').trim()).join(' ') : ''
        };
        
        // 处理相对路径图片
        if (vod.vod_pic && !vod.vod_pic.startsWith('http')) {
            vod.vod_pic = `${siteUrl}${vod.vod_pic.startsWith('/') ? '' : '/'}${vod.vod_pic}`;
        }
        
        if (vod.vod_id && vod.vod_name) {
            list.push(vod);
        }
    }
    
    return list;
}

async function detail(id) {
    try {
        let url = id.startsWith('http') ? id : `${siteUrl}${id}`;
        let html = await request(url);
        
        // 1. 提取基本信息
        let titleMatch = html.match(/<div id="MainContent_titleh12">\s*<div[^>]*title="([^"]+)"[^>]*>([^<]+)<\/div>\s*<h2[^>]*title="([^"]+)"[^>]*>([^<]+)<\/h2>/);
        let posterMatch = html.match(/<div id="MainContent_poster"[^>]*>.*?<img[^>]*src="([^"]+)"[^>]*>/s);
        let yearMatch = html.match(/<label>年份:\s*<a[^>]*>([^<]+)<\/a><\/label>/);
        let resolutionMatch = html.match(/<label>分辨率:\s*([^<]+)<\/label>/);
        let durationMatch = html.match(/<label>片长:\s*([^<]+)<\/label>/);
        
        // 2. 提取描述内容
        let descMatch = html.match(/<div id="MainContent_videodesc">[\s\S]*?<p class="cnline">([\s\S]*?)<\/p>/g);
        let description = '';
        if (descMatch) {
            description = descMatch.map(p => {
                let cleanP = p.replace(/<p class="cnline">|<\/p>/g, '').trim();
                return cleanP;
            }).join('\n\n');
        }
        
        // 3. 提取当前播放地址（从video标签或当前URL）
        let playUrl = '';
        let videoMatch = html.match(/<video[^>]*>.*?<source[^>]*src="([^"]+)"[^>]*>/s);
        if (videoMatch) {
            playUrl = videoMatch[1];
        } else {
            playUrl = url; // 回退到当前页面URL
        }

        // 4. 提取剧集列表（智能处理当前集）
        let episodes = [];
        
        // 添加当前集（从stitle或标题中提取）
        let currentEpInfo = html.match(/<div class="screenshot">\s*<div>.*?<span class="stitle">([^<]+)<\/span>/);
        if (!currentEpInfo) {
            // 如果没找到stitle，从标题提取集数
            currentEpInfo = titleMatch ? titleMatch[1].match(/第(\d+)集/) : null;
        }
        
        episodes.push({
            url: url,
            title: titleMatch ? titleMatch[1] : '当前集',
            episode: currentEpInfo ? currentEpInfo[1] || currentEpInfo[0] : 'EP01'
        });
        
        // 添加其他剧集
        let episodeListMatch = html.match(/<ul id="rtlist">([\s\S]*?)<\/ul>/);
        if (episodeListMatch) {
            let episodeItems = episodeListMatch[1].match(/<li>([\s\S]*?)<\/li>/g) || [];
            
            episodeItems.forEach(item => {
                let epMatch = item.match(/<a\s+href="([^"]+)"[^>]*title="([^"]+)"[^>]*>.*?<span>([^<]+)<\/span>/);
                if (epMatch && !epMatch[1].includes(id.replace(siteUrl, ''))) {
                    episodes.push({
                        url: epMatch[1],
                        title: epMatch[2],
                        episode: epMatch[3]
                    });
                }
            });
        }

        // 5. 生成播放列表（确保当前集在最前）
        let playUrlStr = episodes.map(ep => {
            let epUrl = ep.url.startsWith('http') ? ep.url : `${siteUrl}${ep.url.startsWith('/') ? '' : '/'}${ep.url}`;
            return `${ep.episode}$${epUrl}`;
        }).join('#');
        
        // 如果没有其他剧集，只保留当前集
        if (episodes.length === 1) {
            playUrlStr = `正片$${playUrl}`;
        }

        // 6. 构建返回数据
        let vod = {
            vod_id: id,
            vod_name: titleMatch ? titleMatch[2].trim() : '',
            vod_subtitle: titleMatch ? titleMatch[4].trim() : '',
            vod_pic: posterMatch ? posterMatch[1] : '',
            vod_remarks: (yearMatch ? yearMatch[1].trim() : '') + 
                        (resolutionMatch ? ' | ' + resolutionMatch[1].trim() : '') +
                        (durationMatch ? ' | ' + durationMatch[1].trim() : ''),
            vod_content: description,
            vod_play_from: '4KAV',
            vod_play_url: playUrlStr
        };

        // 处理图片相对路径
        if (vod.vod_pic && !vod.vod_pic.startsWith('http')) {
            vod.vod_pic = `${siteUrl}${vod.vod_pic.startsWith('/') ? '' : '/'}${vod.vod_pic}`;
        }

        return JSON.stringify({
            list: [vod]
        });
    } catch (e) {
        return JSON.stringify({
            list: []
        });
    }
}
async function search(wd, quick, pg) {
    try {
        let url = `${siteUrl}/s?k=${encodeURIComponent(wd)}`;
        let html = await request(url);
        
        let list = await parseNTMItems(html);
        
        // Try to get total page count for pagination
        let pageCount = 1;
        let pageInfoMatch = html.match(/<span class="page-number">页次 \d+\/(\d+)<\/span>/);
        if (pageInfoMatch) {
            pageCount = parseInt(pageInfoMatch[1]);
        }
        
        return JSON.stringify({
            list: list,
            page: parseInt(pg),
            pagecount: pageCount,
            limit: 20,
            total: pageCount * 20 // Approximate total
        });
    } catch (e) {
        console.error("Search error:", e);
        return JSON.stringify({
            list: [],
            page: 1,
            pagecount: 1,
            limit: 20,
            total: 0
        });
    }
}

async function play(flag, id, flags) {
    try {
        let url = id.startsWith('http') ? id : `${siteUrl}${id}`;
        let html = await request(url);
        
        let sourceMatch = html.match(/<source[^>]*src="([^"]+)"/);
        let playUrl = sourceMatch ? sourceMatch[1] : url;
        let parse = sourceMatch ? 0 : 1;
        
        let playHeaders = {
            'Referer': `${siteUrl}/`,
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148',
            'Origin': siteUrl
        };
        
        return JSON.stringify({
            parse: parse,
            url: playUrl,
            header: playHeaders
        });
    } catch (e) {
        return JSON.stringify({
            parse: 1,
            url: id.startsWith('http') ? id : `${siteUrl}${id}`,
            header: {}
        });
    }
}

export function __jsEvalReturn() {
    return {
        init: init,
        home: home,
        homeVod: homeVod,
        category: category,
        detail: detail,
        play: play,
        search: search,
    };
}