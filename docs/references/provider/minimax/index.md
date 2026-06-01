> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimaxi.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Chat Completions API（OpenAI 兼容）

> 使用 OpenAI API 兼容 Chat Completions 格式调用 MiniMax 模型。

<Note>
  ✨ **全新模型 `MiniMax-M3`**

**核心能力**：**Coding/Agentic SOTA**、**1M 超长上下文**、**多模态**。
</Note>

<Tip>
  **`MiniMax-M3` 新特性：**

1. 支持图片、视频理解，可参考右方示例代码
2. 支持通过 `thinking` 参数控制思考
</Tip>


## OpenAPI

````yaml /api-reference/text/api/openapi-chat-openai.json POST /v1/chat/completions
openapi: 3.1.0
info:
  title: MiniMax Text API OpenAI
  description: |
    MiniMax 文本生成 API，支持对话补全与流式输出。

    > ⚡ **`MiniMax-M3` 亮点** —— **Coding/Agentic SOTA**、**1M 超长上下文**、**多模态**。
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.minimaxi.com
security:
  - bearerAuth: []
paths:
  /v1/chat/completions:
    post:
      tags:
        - Text Generation
      summary: Text Generation OpenAI
      operationId: chatCompletionOpenAI
      parameters:
        - name: Content-Type
          in: header
          required: true
          description: 请求体的媒介类型，请设置为 `application/json`，确保请求数据的格式为 JSON
          schema:
            type: string
            enum:
              - application/json
            default: application/json
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChatCompletionReq'
            examples:
              图片理解:
                value:
                  model: MiniMax-M3
                  thinking:
                    type: adaptive
                  messages:
                    - role: user
                      content:
                        - type: text
                          text: 这张图片的内容是什么？
                        - type: image_url
                          image_url:
                            url: >-
                              https://filecdn.minimax.chat/public/fe9d04da-f60e-444d-a2e0-18ae743add33.jpeg
                  max_completion_tokens: 500
              视频理解:
                value:
                  model: MiniMax-M3
                  thinking:
                    type: adaptive
                  messages:
                    - role: user
                      content:
                        - type: text
                          text: 这个视频里发生了什么？
                        - type: video_url
                          video_url:
                            url: >-
                              https://filecdn.minimax.chat/public/ee8c1648-21f1-41b7-8397-65022d22ffe5.mp4
                  max_completion_tokens: 500
              深度思考:
                value:
                  model: MiniMax-M3
                  thinking:
                    type: adaptive
                  messages:
                    - role: user
                      content: 9.11 和 9.9 哪个更大？
                  max_completion_tokens: 500
              流式:
                value:
                  model: MiniMax-M3
                  thinking:
                    type: adaptive
                  messages:
                    - role: user
                      content:
                        - type: text
                          text: 这张图片的内容是什么？
                        - type: image_url
                          image_url:
                            url: >-
                              https://filecdn.minimax.chat/public/fe9d04da-f60e-444d-a2e0-18ae743add33.jpeg
                  stream: true
                  max_completion_tokens: 500
              工具调用:
                value:
                  model: MiniMax-M3
                  messages:
                    - role: user
                      content: 旧金山现在天气怎么样？
                  tools:
                    - type: function
                      function:
                        name: get_weather
                        description: Get the current weather for a given location.
                        parameters:
                          type: object
                          properties:
                            location:
                              type: string
                              description: >-
                                The city and state/country, e.g. San Francisco,
                                US
                          required:
                            - location
        required: true
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ChatCompletionResp'
              examples:
                图片理解:
                  value:
                    id: 066a2a568140d42ba2020cec72d592c0
                    choices:
                      - finish_reason: stop
                        index: 0
                        message:
                          content: >-
                            <think>

                            The user is asking in Chinese what the content of
                            this image is. Let me describe the image in detail
                            in Chinese.

                            </think>

                            这张图片是一张温馨的人像摄影作品，画面内容如下：


                            **主体人物：**

                            - 一个可爱的小女孩，大约3-5岁左右

                            - 她有一头蓬松的棕色卷发，额前有可爱的刘海

                            - 有着大大的棕绿色眼睛，目光清澈明亮

                            - 嘴角微微上扬，展露出甜美、纯真的微笑

                            - 脸颊丰满，皮肤白皙光滑，透着孩童特有的红润


                            **服装：**

                            - 身穿一件米白色或奶油色的连衣裙

                            - 衣领和肩部有精致的蕾丝花边装饰，带有荷叶边设计

                            - 显得十分优雅可爱


                            **构图与光线：**

                            - 这是一张特写肖像照，聚焦于女孩的面部表情

                            - 采用柔和的暖色调光线，营造出温馨梦幻的氛围

                            - 背景是模糊的暖棕色调，采用了浅景深（背景虚化）效果

                            - 整体呈现出油画般的质感，画风柔和、温暖


                            整张照片充满了童真和纯朴之美，捕捉到了小女孩天真烂漫的瞬间。
                          role: assistant
                          name: MiniMax AI
                          audio_content: ''
                    created: 1780152150
                    model: MiniMax-M3
                    object: chat.completion
                    usage:
                      total_tokens: 1604
                      total_characters: 0
                      prompt_tokens: 1365
                      completion_tokens: 239
                      prompt_tokens_details:
                        cached_tokens: 114
                    input_sensitive: false
                    output_sensitive: false
                    input_sensitive_type: 0
                    output_sensitive_type: 0
                    output_sensitive_int: 0
                    base_resp:
                      status_code: 0
                      status_msg: ''
                视频理解:
                  value:
                    id: 066b4556dd449d59fdfbc602ba47bec9
                    choices:
                      - finish_reason: stop
                        index: 0
                        message:
                          content: >-
                            <think>

                            The user wants me to describe the events in the
                            provided video.


                            1.  **Analyze the initial state (0.0s - 0.1s):** A
                            cat is walking on a diving board. The background
                            shows an Olympic setting, specifically London 2012,
                            with the rings and "London 2012" text visible. There
                            are spectators in the stands. A person is standing
                            at the end of the board.


                            2.  **Observe the action (0.1s - 0.2s):** The cat
                            continues to walk confidently along the diving
                            board. It approaches the end of the board. The
                            person at the end moves out of the way.


                            3.  **Identify the climax (0.2s - 0.3s):** The cat
                            reaches the end of the diving board, leaps off, and
                            begins a mid-air rotation. It tucks its body,
                            performing a dive.


                            4.  **Observe the resolution (0.3s - 0.4s):** The
                            cat completes its dive, extending its body to enter
                            the water headfirst. It creates a splash upon entry.


                            5.  **Synthesize the description:**
                                *   Start with the setting: A cat on a diving board at an Olympic venue (London 2012).
                                *   Describe the main action: The cat walks to the end of the board.
                                *   Describe the jump: The cat performs a flip or dive off the board.
                                *   Describe the conclusion: The cat enters the water, creating a splash.

                            6.  **Refine the language:** Make it sound natural
                            and descriptive. "A cat is seen walking on a diving
                            board..." "It then proceeds to jump off..."
                            "...performing a flip before plunging into the water
                            below." This covers all the key elements observed in
                            the video clip.

                            </think>

                            The video shows a cat walking on a diving board. It
                            then proceeds to jump off, performing a flip before
                            plunging into the water below.
                          role: assistant
                          name: MiniMax AI
                          audio_content: ''
                    created: 1780224598
                    model: MiniMax-M3
                    object: chat.completion
                    usage:
                      total_tokens: 2647
                      total_characters: 0
                      prompt_tokens: 2243
                      completion_tokens: 404
                      prompt_tokens_details:
                        cached_tokens: 114
                    input_sensitive: false
                    output_sensitive: false
                    input_sensitive_type: 0
                    output_sensitive_type: 0
                    output_sensitive_int: 0
                    base_resp:
                      status_code: 0
                      status_msg: ''
                深度思考:
                  value:
                    id: 066b36619b147e326d17053cccdef70f
                    choices:
                      - finish_reason: stop
                        index: 0
                        message:
                          content: >-
                            <think>

                            The user is asking which is larger: 9.11 or 9.9.


                            Let me compare these two numbers:

                            - 9.11

                            - 9.9 = 9.90


                            Comparing 9.11 and 9.90:

                            - The integer parts are both 9.

                            - Compare the decimal parts: 11 vs 90 (treating as
                            cents: 0.11 vs 0.90)

                            - 90 > 11, so 9.9 > 9.11


                            This is actually a famous question that is sometimes
                            used to trick people who might confuse string
                            comparison with numerical comparison (since "9.11" >
                            "9.9" as strings, but numerically 9.9 > 9.11).


                            The answer is straightforward: 9.9 is larger.

                            </think>

                            **9.9 更大。**


                            比较方法很简单：把小数位数对齐：


                            - 9.11 = 9.11

                            - 9.90 = 9.9


                            整数部分都是 9，所以比较小数部分：90 > 11，因此 **9.9 > 9.11**。


                            ---


                            这是一个经典的小数比较问题，容易被混淆的原因在于：如果按**字符串**逐字符比较，"9.9"中的 '9'
                            会大于 "9.11"中的 '1'，从而得出相反的结论。但在**数值**上，9.9 = 9.90 显然大于
                            9.11。
                          role: assistant
                          name: MiniMax AI
                          audio_content: ''
                    created: 1780220769
                    model: MiniMax-M3
                    object: chat.completion
                    usage:
                      total_tokens: 473
                      total_characters: 0
                      prompt_tokens: 170
                      completion_tokens: 303
                      prompt_tokens_details:
                        cached_tokens: 157
                    input_sensitive: false
                    output_sensitive: false
                    input_sensitive_type: 0
                    output_sensitive_type: 0
                    output_sensitive_int: 0
                    base_resp:
                      status_code: 0
                      status_msg: ''
                流式:
                  value:
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              <think>
                              The user
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: ' is asking in Chinese what the content of this image is. Let me describe the image in detail.'
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-

                              </think>
                              这张图片是一个小女孩的肖像特写照片。

                              **图片内容描述：**

                              - **
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |
                              人物**：照片中是一个大约3-5岁的小女孩，她正面面对镜头
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              - **外貌特征**：
                                - 棕色的波浪卷发，前面有
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              齐刘海，头发似乎在顶部扎了起来
                                - 大大的浅褐色/
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              榛色眼睛，眼神清澈明亮
                                - 皮肤白皙，脸颊微微泛红

                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |2-
                               - 嘴角带着温柔、腼腆的微笑
                              - **服装**：身穿一件白色
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: 或米色的连衣裙，肩部有精致的蕾丝褶皱装饰，领口也
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              带有蕾丝花边
                              - **背景**：背景是柔和的暖灰色调，营造出温馨
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              的氛围
                              - **光线**：采用了柔和的暖色调光线，类似于经典肖像画的
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: 打光方式（类似伦勃朗光），光从一侧照在女孩脸上
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              ，突出了她的面部轮廓和发丝的光泽
                              - **整体风格**：照片具有油画般的质感
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - finish_reason: stop
                          index: 0
                          delta:
                            content: ，色彩温暖，是一张非常经典的儿童肖像摄影作品
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                工具调用:
                  value:
                    id: 066b13db03518f86c2e3c9b073c04272
                    choices:
                      - finish_reason: tool_calls
                        index: 0
                        message:
                          content: >-
                            <think>

                            The user is asking about the current weather in San
                            Francisco. I should use the get_weather tool to
                            fetch this information.

                            </think>

                            我来帮你查询旧金山的当前天气。
                          role: assistant
                          name: MiniMax AI
                          tool_calls:
                            - id: call_function_p4iiqtpnh5bj_1
                              type: function
                              function:
                                name: get_weather
                                arguments: '{"location": "San Francisco, US"}'
                              index: 0
                          audio_content: ''
                    created: 1780211931
                    model: MiniMax-M3
                    object: chat.completion
                    usage:
                      total_tokens: 477
                      total_characters: 0
                      prompt_tokens: 411
                      completion_tokens: 66
                      prompt_tokens_details:
                        cached_tokens: 114
                    input_sensitive: false
                    output_sensitive: false
                    input_sensitive_type: 0
                    output_sensitive_type: 0
                    output_sensitive_int: 0
                    base_resp:
                      status_code: 0
                      status_msg: ''
            text/event-stream:
              schema:
                $ref: '#/components/schemas/ChatCompletionChunk'
              examples:
                流式:
                  value:
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              <think>
                              The user
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: ' is asking in Chinese what the content of this image is. Let me describe the image in detail.'
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-

                              </think>
                              这张图片是一个小女孩的肖像特写照片。

                              **图片内容描述：**

                              - **
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |
                              人物**：照片中是一个大约3-5岁的小女孩，她正面面对镜头
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              - **外貌特征**：
                                - 棕色的波浪卷发，前面有
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              齐刘海，头发似乎在顶部扎了起来
                                - 大大的浅褐色/
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              榛色眼睛，眼神清澈明亮
                                - 皮肤白皙，脸颊微微泛红

                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |2-
                               - 嘴角带着温柔、腼腆的微笑
                              - **服装**：身穿一件白色
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: 或米色的连衣裙，肩部有精致的蕾丝褶皱装饰，领口也
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              带有蕾丝花边
                              - **背景**：背景是柔和的暖灰色调，营造出温馨
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              的氛围
                              - **光线**：采用了柔和的暖色调光线，类似于经典肖像画的
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: 打光方式（类似伦勃朗光），光从一侧照在女孩脸上
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - index: 0
                          delta:
                            content: |-
                              ，突出了她的面部轮廓和发丝的光泽
                              - **整体风格**：照片具有油画般的质感
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
                    - id: 066a2db7cb70134c45f5d6443d434c2c
                      choices:
                        - finish_reason: stop
                          index: 0
                          delta:
                            content: ，色彩温暖，是一张非常经典的儿童肖像摄影作品
                            role: assistant
                            name: MiniMax AI
                            audio_content: ''
                      created: 1780153015
                      model: MiniMax-M3
                      object: chat.completion.chunk
                      usage: null
                      input_sensitive: false
                      output_sensitive: false
                      input_sensitive_type: 0
                      output_sensitive_type: 0
                      output_sensitive_int: 0
components:
  schemas:
    ChatCompletionReq:
      type: object
      required:
        - model
        - messages
      properties:
        model:
          type: string
          description: 模型 ID
          enum:
            - MiniMax-M3
        messages:
          type: array
          description: 包含对话历史的消息列表。支持文本、图片、视频和工具调用。
          items:
            $ref: '#/components/schemas/Message'
        thinking:
          type: object
          description: 控制深度思考。
          properties:
            type:
              type: string
              enum:
                - disabled
                - adaptive
              default: adaptive
              description: |-
                深度思考模式。
                - `disabled`：关闭思考，直接回答。
                - `adaptive`：模型自主判断是否需要思考（推荐默认值）。
        reasoning_split:
          type: boolean
          description: 启用后将思考内容拆分到 `reasoning_content` 字段。
        stream:
          type: boolean
          description: 是否使用流式传输，默认为 `false`。设置为 `true` 后，响应将分批返回。
          default: false
        stream_options:
          type: object
          description: 流式响应选项。
          properties:
            include_usage:
              type: boolean
              default: false
              description: 是否在流式响应中包含 token 用量。
        max_completion_tokens:
          type: integer
          format: int64
          description: >-
            指定生成内容长度的上限（Token 数）。MiniMax-M3 推荐值为 131072（128K），上限为
            524288（512K）；其他模型推荐值为 65536（64K），上限为 204800（200K）。如果生成因 `length`
            原因中断，请尝试调高此值。
          minimum: 1
        temperature:
          type: number
          format: double
          description: 温度系数，影响输出随机性，取值范围 [0, 2]，默认值为 1。值越高，输出越随机；值越低，输出越确定。
          minimum: 0
          maximum: 2
          default: 1
        top_p:
          type: number
          format: double
          description: 核采样参数，取值范围 [0, 1]。MiniMax-M3 默认值为 0.95，M2.x 系列模型默认值为 0.9。
          minimum: 0
          maximum: 1
          default: 0.95
        tools:
          type: array
          description: 工具定义列表，当前支持 function 工具。
          items:
            type: object
            properties:
              type:
                type: string
                enum:
                  - function
                description: 工具类型，固定为 function。
              function:
                type: object
                properties:
                  name:
                    type: string
                    description: 函数名称。
                  description:
                    type: string
                    description: 函数描述。
                  parameters:
                    type: object
                    description: 函数参数 JSON Schema。
                required:
                  - name
                  - parameters
            required:
              - type
              - function
        max_tokens:
          type: integer
          format: int64
          deprecated: true
          description: 旧版生成长度限制参数。已弃用，请改用 `max_completion_tokens`。
          minimum: 1
    ChatCompletionResp:
      type: object
      properties:
        id:
          type: string
          description: 本次响应的唯一 ID
        choices:
          type: array
          description: 响应选择列表
          items:
            type: object
            properties:
              finish_reason:
                type: string
                description: 生成停止的原因：`stop`、`length`、`content_filter` 或 `tool_calls`。
                enum:
                  - stop
                  - length
                  - content_filter
                  - tool_calls
              index:
                type: integer
                description: 选项的索引，从 0 开始
              message:
                type: object
                description: 模型生成的完整回复
                required:
                  - content
                  - role
                properties:
                  content:
                    type: string
                    description: 文本回复内容
                  reasoning_content:
                    type: string
                    description: 思考内容。仅在启用 reasoning_split 时返回。
                  role:
                    type: string
                    description: 角色，固定为 `assistant`
                    enum:
                      - assistant
                  tool_calls:
                    type: array
                    description: >-
                      模型生成的工具调用列表。仅当 `finish_reason` 为 `tool_calls` 时返回。下一轮请求需在
                      assistant 消息中原样回带这些调用，并为每个调用追加一条 `role: tool` 消息，其
                      `tool_call_id` 取自此处的 `id`。
                    items:
                      $ref: '#/components/schemas/ToolCall'
        created:
          type: integer
          format: int64
          description: 响应创建的 Unix 时间戳（秒）
        model:
          type: string
          description: 本次请求使用的模型 ID
        object:
          type: string
          description: 对象类型。非流式为 `chat.completion`，流式为 `chat.completion.chunk`
          enum:
            - chat.completion
            - chat.completion.chunk
        usage:
          $ref: '#/components/schemas/Usage'
        input_sensitive:
          type: boolean
          description: 输入内容是否命中敏感词。如果输入内容严重违规，接口会返回内容违规错误信息，回复内容为空
        input_sensitive_type:
          type: integer
          format: int64
          description: >-
            输入命中敏感词类型，当input_sensitive为true时返回。取值为以下其一：1 严重违规；2 色情；3 广告；4 违禁；5
            谩骂；6 暴恐；7 其他
        output_sensitive:
          type: boolean
          description: 输出内容是否命中敏感词。如果输出内容严重违规，接口会返回内容违规错误信息，回复内容为空
        output_sensitive_type:
          type: integer
          format: int64
          description: 输出命中敏感词类型
        base_resp:
          type: object
          description: 错误状态码和详情
          properties:
            status_code:
              type: integer
              format: int64
              description: |-
                状态码

                - `1000`: 未知错误
                - `1001`: 请求超时
                - `1002`: 触发限流
                - `1004`: 鉴权失败
                - `1008`: 余额不足
                - `1013`: 服务内部错误
                - `1027`: 输出内容错误
                - `1039`:  Token 超出限制
                - `2013`: 参数错误

                更多内容可查看 [错误码查询列表](/api-reference/errorcode) 了解详情
            status_msg:
              type: string
              description: 错误详情
    ChatCompletionChunk:
      type: object
      description: ''
      properties:
        id:
          type: string
          description: 本次响应的唯一 ID
        choices:
          type: array
          description: 流式响应选择列表
          items:
            type: object
            properties:
              index:
                type: integer
                description: 选项的索引，从 0 开始
              delta:
                type: object
                description: 增量内容
                properties:
                  role:
                    type: string
                    description: 角色，固定为 `assistant`
                    enum:
                      - assistant
                  content:
                    type: string
                    description: 增量文本内容
              finish_reason:
                type: string
                nullable: true
                description: >-
                  生成停止的原因，未结束时为 null：`stop`（自然结束），`length`（达到
                  `max_completion_tokens` 上限）
                enum:
                  - stop
                  - length
        created:
          type: integer
          format: int64
          description: 响应创建的 Unix 时间戳（秒）
        model:
          type: string
          description: 本次请求使用的模型 ID
        object:
          type: string
          description: 对象类型，固定为 `chat.completion.chunk`
          enum:
            - chat.completion.chunk
        usage:
          $ref: '#/components/schemas/Usage'
          description: Token 使用情况（仅在最后一个 chunk 中返回）
        input_sensitive_type:
          type: integer
          format: int64
          description: 输入命中敏感词类型
        output_sensitive:
          type: boolean
          description: 输出内容是否命中敏感词
        output_sensitive_type:
          type: integer
          format: int64
          description: 输出命中敏感词类型
    Message:
      type: object
      required:
        - role
      properties:
        role:
          type: string
          enum:
            - system
            - user
            - assistant
            - tool
          description: 消息发送者的角色。
        name:
          type: string
          description: 发送者的名称。若同一类型的角色有多个，须提供具体名称以区分
        content:
          oneOf:
            - type: string
              description: 文本消息内容
            - type: array
              description: >-
                多模态消息内容块。MiniMax-M3 支持文本、图片和视频输入。


                **多模态文件大小及容量限制**

                - URL / Base64 方式传入：视频文件 ≤ 50 MB，图片文件 ≤ 10 MB，请求体 ≤ 64 MB。

                - 使用 Files API 上传：在 `content` 中以 `mm_file://{file_id}`
                形式引用，单个视频最大 512 MB。
              items:
                $ref: '#/components/schemas/MessageContentPart'
          description: 消息内容。MiniMax-M3 支持文本、图片和视频内容块。
        tool_calls:
          type: array
          description: assistant 消息中的工具调用列表。
          items:
            $ref: '#/components/schemas/ToolCall'
        tool_call_id:
          type: string
          description: >-
            工具调用 ID。当 `role` 为 `tool` 时必填，取值为上一轮 assistant 消息中 `tool_calls`
            内对应一项的 `id`，用于将本条工具返回结果与具体的工具调用关联。其他角色下该字段会被忽略。
    ToolCall:
      type: object
      required:
        - id
        - type
        - function
      description: assistant 消息中模型生成的工具调用。
      properties:
        id:
          type: string
          description: 工具调用 ID，由模型生成。
        type:
          type: string
          enum:
            - function
          description: 工具调用类型。当前仅支持 `function`。
        function:
          type: object
          required:
            - name
            - arguments
          properties:
            name:
              type: string
              description: 待调用函数名称。
            arguments:
              type: string
              description: 函数入参，JSON 格式字符串。
    Usage:
      type: object
      description: 本次请求的 Token 使用情况统计
      properties:
        total_tokens:
          type: integer
          description: 消耗的总 Token 数
    MessageContentPart:
      type: object
      required:
        - type
      description: 多模态消息内容块。每个内容块通过 `type` 声明类型，仅填写与该类型匹配的字段。
      properties:
        type:
          type: string
          enum:
            - text
            - image_url
            - video_url
          description: |-
            内容块类型：
            - `text`：文本块
            - `image_url`：图片输入
            - `video_url`：视频输入
        text:
          type: string
          description: 文本内容（当 `type` 为 `text` 时）。
        image_url:
          type: object
          description: |-
            图片输入（当 `type` 为 `image_url` 时）。单张图片最大 10 MB。

            **支持的图片格式**

            | 格式 | 常见拓展名 | MIME Type |
            | :-- | :-- | :-- |
            | JPEG | .jpg, .jpeg | image/jpeg |
            | PNG | .png | image/png |
            | GIF | .gif | image/gif |
            | WEBP | .webp | image/webp |
          required:
            - url
          properties:
            url:
              type: string
              description: 图片 URL 或 Base64 data URL。
            detail:
              type: string
              enum:
                - low
                - default
                - high
              default: default
              description: |-
                控制图片解析分辨率，默认值为 default。

                单张图片粗略 token 用量估算：

                | detail | 粗略 token 用量 |
                | :-- | :-- |
                | low | 通常为几百 token，最高约 600 |
                | default | 通常约 1k-3k token，最高约 5k |
                | high | 通常为数千 token，最高约 15k+ |

                实际用量取决于图片尺寸和内容；请以响应中的 usage 或可用的 token 计数接口为准。
            max_long_side_pixel:
              type: integer
              minimum: 1
              description: 图片最长边像素限制。
        video_url:
          type: object
          description: >-
            视频输入（当 `type` 为 `video_url` 时）。


            **支持的视频格式**


            | 格式 | 常见拓展名 | MIME Type |

            | :-- | :-- | :-- |

            | MP4 | .mp4 | video/mp4 |

            | AVI | .avi | video/avi 或 video/x-msvideo |

            | MOV | .mov | url 传入视频：对象存储请设置 Content-Type 为
            video/quicktime；base64 编码：请使用 video/mov，即
            data:video/mov;base64,<BASE64_ENCODING> |

            | MKV | .mkv | video/x-matroska |
          required:
            - url
          properties:
            url:
              type: string
              description: >-
                视频 URL、Base64 data URL，或形如 `mm_file://{file_id}` 的 Files API
                引用。`file_id`
                需先通过[文件上传](/api-reference/file-management-upload)接口上传视频后获取。URL 或
                Base64 视频最大 50 MB；Files API 视频最大 512 MB。
            detail:
              type: string
              enum:
                - low
                - default
                - high
              default: default
              description: 控制视频抽帧分辨率，默认值为 default。
            fps:
              type: number
              minimum: 0.2
              maximum: 5
              default: 1
              description: |-
                视频抽帧频率。默认值为 1，范围 [0.2, 5]。
                - 取值越高：对画面变化越敏感，token 花费高、速度慢。
                - 取值越低：token 花费少、速度快，但对画面变化迟钝。
            max_long_side_pixel:
              type: integer
              minimum: 1
              description: 视频单帧最长边像素限制。
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: |-
        `HTTP: Bearer Auth`
         - Security Scheme Type: http
         - HTTP Authorization Scheme: Bearer API_key，用于验证账户信息，可在 [账户管理>接口密钥](https://platform.minimaxi.com/user-center/basic-information/interface-key) 中查看

````
