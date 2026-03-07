package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"kanban-app/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type R2Service struct {
	client    *s3.Client
	presigner *s3.PresignClient
	bucket    string
	enabled   bool
}

var R2 *R2Service

func InitR2(cfg *config.Config) {
	R2 = &R2Service{enabled: cfg.R2Enabled}

	if !cfg.R2Enabled {
		log.Println("R2 storage disabled — using local disk")
		return
	}

	if cfg.R2Bucket == "" || cfg.R2AccessKey == "" || cfg.R2SecretKey == "" || cfg.R2Endpoint == "" {
		log.Fatal("R2 is enabled but R2_BUCKET, R2_ACCESS_KEY, R2_SECRET_KEY, or R2_ACCOUNT_ID is missing")
	}

	// R2 uses "auto" region
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion("auto"),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.R2AccessKey, cfg.R2SecretKey, ""),
		),
	)
	if err != nil {
		log.Fatalf("Failed to load R2 config: %v", err)
	}

	// R2 uses S3-compatible API with custom endpoint and path-style
	R2.client = s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.R2Endpoint)
		o.UsePathStyle = true
	})
	R2.presigner = s3.NewPresignClient(R2.client)
	R2.bucket = cfg.R2Bucket

	log.Printf("R2 storage enabled — bucket: %s, endpoint: %s", cfg.R2Bucket, cfg.R2Endpoint)
}

func (s *R2Service) IsEnabled() bool {
	return s.enabled
}

// GenerateUploadURL creates a presigned PUT URL for direct upload
func (s *R2Service) GenerateUploadURL(key string, contentType string, maxSize int64) (string, error) {
	input := &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	}

	resp, err := s.presigner.PresignPutObject(context.Background(), input, func(po *s3.PresignOptions) {
		po.Expires = 10 * time.Minute
	})
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned upload URL: %w", err)
	}

	return resp.URL, nil
}

// GenerateDownloadURL creates a presigned GET URL for secure file download
func (s *R2Service) GenerateDownloadURL(key string, filename string) (string, error) {
	input := &s3.GetObjectInput{
		Bucket:                     aws.String(s.bucket),
		Key:                        aws.String(key),
		ResponseContentDisposition: aws.String(fmt.Sprintf("attachment; filename=\"%s\"", filename)),
	}

	resp, err := s.presigner.PresignGetObject(context.Background(), input, func(po *s3.PresignOptions) {
		po.Expires = 15 * time.Minute
	})
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned download URL: %w", err)
	}

	return resp.URL, nil
}

// GenerateViewURL creates a presigned GET URL for inline viewing (images)
func (s *R2Service) GenerateViewURL(key string) (string, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}

	resp, err := s.presigner.PresignGetObject(context.Background(), input, func(po *s3.PresignOptions) {
		po.Expires = 60 * time.Minute
	})
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned view URL: %w", err)
	}

	return resp.URL, nil
}

// DeleteObject removes a file from R2
func (s *R2Service) DeleteObject(key string) error {
	_, err := s.client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("failed to delete R2 object: %w", err)
	}
	return nil
}
